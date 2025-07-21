const ethers = require("ethers");
const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const collectibleContractABI = require("../../contracts/SqwidERC1155").ABI;
const marketplaceContractABI = require("../../contracts/SqwidMarketplace").ABI;
const multicallContractABI = require("../../contracts/Multicall3").ABI;
const splitzContractABI = require ('../../contracts/Splitz').ABI;
const { getWallet } = require("../../lib/getWallet");
const getNetworkConfig = require("../../lib/getNetworkConfig");
const firebase = require("../../lib/firebase");
const { FieldPath } = require("firebase-admin").firestore;
const {
  fetchCachedCollectibles,
  cacheCollectibles,
  fetchCachedCollections,
  cacheCollections,
  fetchCachedNames,
  cacheNames,
} = require("../../lib/caching");
const CollectibleContract = (signerOrProvider, contractAddress) =>
  new ethers.Contract(
    contractAddress || getNetworkConfig().contracts["erc1155"],
    collectibleContractABI,
    signerOrProvider
  );
const MarketplaceContract = (signerOrProvider) =>
  new ethers.Contract(
    getNetworkConfig().contracts["marketplace"],
    marketplaceContractABI,
    signerOrProvider
  );
const MulticallContract = (signerOrProvider, contractAddress) =>
  new ethers.Contract(
    contractAddress || getNetworkConfig().contracts["multicall"],
    multicallContractABI,
    signerOrProvider
  );
const SplitzContract = (signerOrProvider, contractAddress)=>new ethers.Contract (contractAddress, splitzContractABI, signerOrProvider);
const { verify } = require("../../middleware/auth");
const { getEVMAddress } = require("../../lib/getEVMAddress");
const {
  balanceQuery,
  doQuery,
  withdrawableQuery,
  itemByNftIdQuery,
  positionsByStateQuery,
  bidsByBidder,
  getCollectionAmountFromUser,
  toIndexerId, contractAddressQuery,
} = require("../../lib/graphqlApi");
const { getAvatar } = require("../../utils/avatars");
const { firestore } = require("firebase-admin");
let provider, marketplaceContract, collectibleContract;

const db = firebase;
getWallet().then(async (wallet) => {
  provider = wallet.provider;
  marketplaceContract = MarketplaceContract(provider);
  collectibleContract = CollectibleContract(provider);
  multicallContract = MulticallContract(provider);
  console.log("Wallet loaded.");
});
let collectionsOfApprovedItems = {};
let approvedIds = {};
let featuredIds = [];

firebase
  .collection("blacklists")
  .doc("collectibles")
  .onSnapshot((snapshot) => {
    let data = snapshot.data();
    if (!data?.allowed) {
      approvedIds = [];
      collections = {};
    } else {
      collectionsOfApprovedItems = Array.from(
        new Set(data.allowed.map((item) => item.collection))
      );
      approvedIds = data.allowed.map((item) => {
        return {
          id: item.id,
          collection: collectionsOfApprovedItems.indexOf(item.collection),
        };
      });
      approvedIds = approvedIds.sort((a, b) => a.id - b.id);
    }
  });

firebase
  .collection("config")
  .doc("collectibles")
  .onSnapshot((snapshot) => {
    if (!snapshot.exists) return;
    let data = snapshot.data();
    featuredIds = data.featured;
  });

const sliceIntoChunks = (arr, chunkSize) => {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
};

const setBoolean = (packedBools, boolNumber, value) =>
  value ? packedBools | (1 << boolNumber) : packedBools & (~1 << boolNumber);

const getBoolsArray = (arr) => {
  const max = arr[arr.length - 1];
  let boolArray = new Array(max + 1).fill(false);
  arr.forEach((i) => (boolArray[i] = true));
  let packed = [];
  for (let i = max; i > 0; i--) {
    packed[(i / 8) | 0] = setBoolean(
      packed[(i / 8) | 0] || 0,
      (i + 0) % 8,
      boolArray[i]
    );
  }
  return packed;
};

const getAuctionDatas = async (positionIds) => {
  const calls = positionIds.map((positionId) => ({
    target: marketplaceContract.address,
    allowFailure: true,
    callData: marketplaceContract.interface.encodeFunctionData(
      "fetchAuctionData",
      [positionId]
    ),
  }));

  const response = await multicallContract.callStatic.aggregate3(calls);

  const auctionDatas = new Map();
  const highestBidders = [];
  response.forEach(({ success, returnData }, i) => {
    if (!success)
      throw new Error(`Failed to get auction data for ${positionIds[i]}`);
    const auctionData = marketplaceContract.interface.decodeFunctionResult(
      "fetchAuctionData",
      returnData
    )[0];
    auctionDatas.set(positionIds[i], {
      deadline: Number(auctionData.deadline),
      minBid: Number(auctionData.minBid),
      highestBid: Number(auctionData.highestBid),
      highestBidder: {
        address: auctionData.highestBidder,
        name: auctionData.highestBidder,
      },
    });
    highestBidders.push(auctionData.highestBidder);
  });

  return { auctionDatas, highestBidders };
};

const getRaffleDatas = async (positionIds) => {
  const calls = positionIds.map((positionId) => ({
    target: marketplaceContract.address,
    allowFailure: true,
    callData: marketplaceContract.interface.encodeFunctionData(
      "fetchRaffleData",
      [positionId]
    ),
  }));

  const response = await multicallContract.callStatic.aggregate3(calls);

  const raffleDatas = new Map();
  response.forEach(({ success, returnData }, i) => {
    if (!success)
      throw new Error(`Failed to get raffle data for ${positionIds[i]}`);
    const raffleData = marketplaceContract.interface.decodeFunctionResult(
      "fetchRaffleData",
      returnData
    )[0];
    raffleDatas.set(positionIds[i], {
      deadline: Number(raffleData.deadline),
      totalValue: Number(raffleData.totalValue) * 10 ** 18,
      totalAddresses: Number(raffleData.totalAddresses),
    });
  });

  return { raffleDatas };
};

const getLoanDatas = async (positionIds) => {
  const calls = positionIds.map((positionId) => ({
    target: marketplaceContract.address,
    allowFailure: true,
    callData: marketplaceContract.interface.encodeFunctionData(
      "fetchLoanData",
      [positionId]
    ),
  }));

  const response = await multicallContract.callStatic.aggregate3(calls);

  const loanDatas = new Map();
  const lenders = [];
  response.forEach(({ success, returnData }, i) => {
    if (!success)
      throw new Error(`Failed to get loan data for ${positionIds[i]}`);
    const loanData = marketplaceContract.interface.decodeFunctionResult(
      "fetchLoanData",
      returnData
    )[0];
    loanDatas.set(positionIds[i], {
      deadline: Number(loanData.deadline),
      loanAmount: Number(loanData.loanAmount),
      feeAmount: Number(loanData.feeAmount),
      numMinutes: Number(loanData.numMinutes),
      lender: {
        address: loanData.lender,
        name: loanData.lender,
      },
    });
    lenders.push(loanData.lender);
  });

  return { loanDatas, lenders };
};

const buildSaleData = (position) => {
  return {
    price: Number(position.price),
  };
};

const buildAuctionData = (auctionData, names) => {
  return {
    deadline: Number(auctionData.deadline),
    minBid: Number(auctionData.minBid),
    highestBid: Number(auctionData.highestBid),
    highestBidder: {
      address: auctionData.highestBidder,
      name: names[auctionData.highestBidder] || auctionData.highestBidder,
    },
  };
};

const buildRaffleData = (raffleData) => {
  return {
    deadline: Number(raffleData.deadline),
    totalValue: Number(raffleData.totalValue) * 10 ** 18,
    totalAddresses: Number(raffleData.totalAddresses),
  };
};

const buildLoanData = (loanData, names) => {
  return {
    deadline: Number(loanData.deadline),
    loanAmount: Number(loanData.loanAmount),
    feeAmount: Number(loanData.feeAmount),
    numMinutes: Number(loanData.numMinutes),
    lender: {
      address: loanData.lender,
      name: names[loanData.lender] || loanData.lender,
    },
  };
};

const fetchCollection = async (req, res) => {
  const { collectionId } = req.params;

  let collection = await getDbCollections([collectionId]);

  if (!collection.length)
    return res.status(404).send({ error: "Collection does not exist." });
  collection = collection[0].data;
  let user = await getNamesByEVMAddresses([collection.owner]);
  user = user[0];

  let collectionResponse = {
    name: collection.name,
    creator: {
      id: user?.address,
      name: user?.name,
      thumb: getAvatar(user?.address),
    },
    thumb: collection.image,
    description: collection.description,
    traits: collection.traits,
  };

  res?.json(collectionResponse);
  return collectionResponse;
};

const fetchCollectionStats = async (req, res) => {
  const { collectionId } = req.params;

  let collection = await firebase
    .collection("collections")
    .doc(collectionId)
    .get();

  if (!collection.exists)
    return res.status(404).send({ error: "Collection does not exist." });
  collection = collection.data();
  if (!collection.stats)
    return res.status(404).send({ error: "Collection does not have stats." });
  let collectionResponse = collection.stats;

  res?.json(collectionResponse);
  return collectionResponse;
};

const fetchPosition = async (req, res) => {
  const { positionId } = req.params;
  try {
    const position = await marketplaceContract.fetchPosition(positionId);

    if (!Number(position.amount))
      return res?.status(404).send({ error: "Position does not exist." });

    let collectibleData = await getDbCollectibles([Number(position.itemId)]);

    if (!collectibleData.length) throw new Error(`Collectible does not exist.`);

    collectibleData = collectibleData[0];

    const item = await marketplaceContract.fetchItem(position.itemId);

    let auctionData,
      raffleData,
      loanData = null;
    const addressesNameSearch = [item.creator, position.owner];
    switch (position.state) {
      case 2:
        auctionData = await marketplaceContract.fetchAuctionData(positionId);
        addressesNameSearch.push(auctionData.highestBidder);
        break;
      case 3:
        raffleData = await marketplaceContract.fetchRaffleData(positionId);
        break;
      case 4:
        loanData = await marketplaceContract.fetchLoanData(positionId);
        addressesNameSearch.push(loanData.lender);
        break;
    }

    const collectionPromise = getDbCollections([collectibleData.collectionId]);
    const namesPromise = getNamesByEVMAddresses(
      Array.from(
        new Set([...addressesNameSearch, ...(collectibleData.hearts || [])])
      )
    );
    const itemMetaPromise = collectibleContract.uri(item.tokenId);
    const itemRoyaltiesPromise = collectibleContract.royaltyInfo(
      item.tokenId,
      100
    );
    const [collection, names, itemMeta, itemRoyalty] = await Promise.all([
      collectionPromise,
      namesPromise,
      itemMetaPromise,
      itemRoyaltiesPromise,
    ]);

    let namesObj = {};
    names.forEach((name) => {
      namesObj = { ...namesObj, [name.address]: name.name };
    });

        const receivers = [];

        //check if itemRoyalty.receiver is account address or contract address
        const contractAddressResponse = await doQuery(contractAddressQuery(
            itemRoyalty.receiver
        ));

        // if contract address
        if(contractAddressResponse==itemRoyalty.receiver){
            const splitzContract = SplitzContract(provider,
                itemRoyalty.receiver
            );
            // get splitzer recipients
            const splitzRecipients = await splitzContract.getPayees();

            // append them in receivers
            splitzRecipients.forEach((recipient)=>{
                receivers.push({
                    receiver:recipient.payee,
                    share:recipient.share.toNumber()
                })
            })
        }else{
            // if account address 
            receivers.push({
                receiver:itemRoyalty.receiver,
                share:100
            });
        }

    const itemObject = {
      approved: collectibleData.approved,
      positionId: Number(position.positionId),
      itemId: Number(item.itemId),
      tokenId: Number(item.tokenId),
      hearts:
        collectibleData.hearts?.map((usr) => ({
          name: namesObj[usr],
          address: usr,
        })) || [],
      collection: {
        ...collection[0].data,
        id: collection[0].id,
      },
      creator: {
        address: item.creator,
        avatar: getAvatar(item.creator),
        name: namesObj[item.creator] || item.creator,
        royalty:itemRoyalty.royaltyAmount.toNumber(),
                royaltyReceivers:receivers
      },
      owner: {
        address: position.owner,
        avatar: getAvatar(position.owner),
        name: namesObj[position.owner] || position.owner,
      },
      amount: Number(position.amount),
      sale: position.state === 1 ? buildSaleData(position) : null,
      auction:
        position.state === 2 ? buildAuctionData(auctionData, namesObj) : null,
      raffle: position.state === 3 ? buildRaffleData(raffleData) : null,
      loan: position.state === 4 ? buildLoanData(loanData, namesObj) : null,
      marketFee: Number(position.marketFee),
      state: position.state,
      meta: {
        ...collectibleData.meta,
        uri: itemMeta,
        tokenContract: item.nftContract,
      },
    };
    res?.status(200).json(itemObject);
    return itemObject;
  } catch (err) {
    console.log("marketplace 1 ERR=", err);
    res?.json({
      error: err.toString(),
    });
    return null;
  }
};

const getDbCollectibles = async (items) => {
  // get from cache
  const { cached, leftoverItems } = await fetchCachedCollectibles(items);
  if (leftoverItems.length === 0) return cached;
  items = leftoverItems;
  // firebase read
  const collectiblesRef = firebase.collection("collectibles");
  const chunks = sliceIntoChunks(items, 10);
  const promiseArray = chunks.map((chunk) =>
    collectiblesRef.where("id", "in", chunk).get()
  );
  const collectibles = await Promise.allSettled(promiseArray);
  const fResult = collectibles
    .filter((chunk) => chunk.status === "fulfilled")
    .map((chunk) => chunk.value.docs)
    .reduce((acc, curr) => [...acc, ...curr], [])
    .map((doc) => doc.data());
  // set cache
  cacheCollectibles(fResult);
  return cached.concat(fResult);
};

const getDbCollections = async (items) => {
  // get from cache
  const { cached, leftoverItems } = await fetchCachedCollections(items);
  if (leftoverItems.length === 0) return cached;
  items = leftoverItems;
  // firebase read
  const collectionsRef = firebase.collection("collections");
  const chunks = sliceIntoChunks(items, 10);
  const promiseArray = chunks.map((chunk) =>
    collectionsRef.where(FieldPath.documentId(), "in", chunk).get()
  );
  const collections = await Promise.allSettled(promiseArray);
  const fResult = collections
    .filter((chunk) => chunk.status === "fulfilled")
    .map((chunk) => chunk.value.docs)
    .reduce((acc, curr) => [...acc, ...curr], [])
    .map((doc) => {
      return { id: doc.id, data: doc.data() };
    });

  // set cache
  cacheCollections(fResult);

  return cached.concat(fResult);
};

const getNamesByEVMAddresses = async (addresses) => {
  const { cached, leftoverItems } = await fetchCachedNames(addresses);
  if (leftoverItems.length === 0) return cached;
  addresses = leftoverItems.filter((v) => !!v);

  const usersRef = firebase.collection("users");
  const chunks = sliceIntoChunks(addresses, 10);
  const promiseArray = chunks.map((chunk) =>
    usersRef.where("evmAddress", "in", chunk).get()
  );
  const users = await Promise.allSettled(promiseArray);
  const fResult = users
    .filter((chunk) => chunk.status === "fulfilled")
    .map((chunk) => chunk.value.docs)
    .reduce((acc, curr) => [...acc, ...curr], [])
    .map((doc) => {
      return { name: doc.data().displayName, address: doc.data().evmAddress };
    });

  cacheNames(fResult);

  return cached.concat(fResult);
};

const buildObjectsFromPositions = async (positions, additionalNamesSearch) => {
  const itemIds = Array.from(
    new Set(positions.map((position) => position.itemId))
  );
  const collectionsSet = new Set(
    positions.map(
      (position) =>
        collectionsOfApprovedItems[
          approvedIds.find((i) => i.id === position.itemId).collection
        ]
    )
  );
  const addresses = new Set(
    positions.reduce(
      (acc, position) => [...acc, position.owner, position.itemCreator],
      additionalNamesSearch
    )
  );
  const collectiblesPromise = getDbCollectibles(itemIds);
  const namesPromise = getNamesByEVMAddresses(Array.from(addresses));
  const collectionsPromise = getDbCollections(Array.from(collectionsSet));
  const [collectibles, names, collections] = await Promise.all([
    collectiblesPromise,
    namesPromise,
    collectionsPromise,
  ]);

  const collectiblesObject = collectibles.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});

  const collectionsObject = collections.reduce((acc, collection) => {
    delete collection.data.traits;
    return {
      ...acc,
      [collection.id]: { ...collection.data, id: collection.id },
    };
  }, {});
  let namesObj = {};
  names.forEach((name) => {
    namesObj = { ...namesObj, [name.address]: name.name };
  });

  return {
    collectibles: collectiblesObject,
    collections: collectionsObject,
    names: namesObj,
  };
};

const getClaimableItems = async (address) => {
  let claimableItems = await firebase
    .collection("claims")
    .where("claimed", "==", false)
    .where("owner", "==", address)
    .where("amount", ">", 0)
    .get();
  let items = {};
  claimableItems.forEach((doc) => {
    const data = doc.data();
    if (items[data.nftId]) {
      items[data.nftId].amount += data.amount;
    } else {
      items[data.nftId] = {
        tokenId: data.nftId,
        amount: data.amount,
      };
    }
  });
  const itemIds = [];
  // get itemId from tokenId
  items = Object.values(items);
  items = await Promise.all(
    items.map(async (item, i) => {
      const itemRes = await doQuery(itemByNftIdQuery(item.tokenId));
      if (!itemRes) {
        console.log("Item does not exist in marketplace.");
        return;
      }
      const { id, creator } = itemRes;
      itemIds.push(id);
      return { ...item, itemId: id, creator };
    })
  );
  items = items.filter((item) =>
    approvedIds.find((i) => i.id === Number(item.itemId))
  );

  const collectionsSet = new Set(
    items.map(
      (item) =>
        collectionsOfApprovedItems[
          approvedIds.find((i) => i.id === Number(item.itemId)).collection
        ]
    )
  );
  const addresses = new Set(
    items.reduce((acc, item) => [...acc, item.from, item.creator], [])
  );
  const collectiblesPromise = getDbCollectibles(itemIds);
  const namesPromise = getNamesByEVMAddresses(Array.from(addresses));
  const collectionsPromise = getDbCollections(Array.from(collectionsSet));
  const [collectibles, names, collections] = await Promise.all([
    collectiblesPromise,
    namesPromise,
    collectionsPromise,
  ]);
  const collectiblesObject = collectibles.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});

  const collectionsObject = collections.reduce((acc, collection) => {
    delete collection.data.traits;
    return {
      ...acc,
      [collection.id]: { ...collection.data, id: collection.id },
    };
  }, {});
  let namesObj = {};
  names.forEach((name) => {
    namesObj = { ...namesObj, [name.address]: name.name };
  });
  const results = items.map((item) => {
    const meta = collectiblesObject[item.itemId];
    const collection =
      collectionsObject[
        collectionsOfApprovedItems[
          approvedIds.find((i) => i.id === Number(item.itemId)).collection
        ]
      ];
    return {
      ...item,
      meta,
      collection,
      from: {
        name: namesObj[item.from],
        address: item.from,
        avatar: getAvatar(item.from),
      },
      creator: {
        name: namesObj[meta.creator],
        address: meta.creator,
        avatar: getAvatar(meta.creator),
      },
    };
  });
  return results;
};

const isWhitelistedItem = async (req, res) => {
  try {
    const isApproved = !!approvedIds.find(
      (i) => i.id === Number(req.params.id)
    );
    return res.send(isApproved);
  } catch (error) {
    console.log("isWhitelistedItem ERR===", error);
    return res.send(false);
  }
};

const getClaimableItemsCount = async (address) => {
  let snapshot = await firebase
    .collection("claims")
    .where("claimed", "==", false)
    .where("owner", "==", address)
    .where("amount", ">", 0)
    .get();
  let data = snapshot.docs.map((doc) => doc.data());
  const filteredClaimables = data.filter((item) =>
    approvedIds.find((i) => i.id === Number(item.nftId))
  );
  return filteredClaimables.length;
};

const grabItemsWithTraits = async (traits, collectionId) => {
  let baseQ = firebase
    .collection("collectibles")
    .where("collectionId", "==", collectionId);
  const queries = Object.keys(traits).map((trait) => {
    if (typeof traits[trait] === "object" && traits[trait].length) {
      return baseQ
        .where(
          `trait:${trait.toUpperCase()}`,
          "in",
          traits[trait].map((t) => t.toUpperCase())
        )
        .get();
    } else {
      return baseQ
        .where(
          `trait:${trait.toUpperCase()}`,
          "==",
          traits[trait].toUpperCase()
        )
        .get();
    }
  });
  const allQueries = await Promise.all(queries);
  const ids = new Set();
  allQueries.forEach((q) => {
    q.forEach((snapshot) => {
      ids.add(snapshot.data().id);
    });
  });
  return ids;
};

const fetchSummary = async (_req, res) => {
  try {
    const searchItemIds = new Set(approvedIds.map((item) => item.id));

    if (!Array.from(searchItemIds).length)
      return res.status(200).json({
        sale: [],
        auction: [],
        raffle: [],
        loan: [],
      });
    const allRawPositions = await Promise.all(
      new Array(4).fill(null).map((_, i) =>
        doQuery(
          positionsByStateQuery(
            i + 1, // state
            ethers.constants.AddressZero, // owner
            0, // startFrom
            4, // limit
            Array.from(searchItemIds),
            ethers.constants.AddressZero // creator address
          )
        )
      )
    );

    const additionalNamesSearch = [];
    const auctionIds = allRawPositions[1].map(
      (position) => position.positionId
    );
    const raffleIds = allRawPositions[2].map((position) => position.positionId);
    const loanIds = allRawPositions[3].map((position) => position.positionId);
    const [auctionDatas, raffleDatas, loanDatas] = await Promise.all([
      getAuctionDatas(auctionIds),
      getRaffleDatas(raffleIds),
      getLoanDatas(loanIds),
    ]);
    additionalNamesSearch.push(
      ...auctionDatas.highestBidders,
      ...loanDatas.lenders
    );
    const allRawPositionsFlat = allRawPositions.reduce(
      (acc, curr) => [...acc, ...curr],
      additionalNamesSearch
    );
    const rawPositions = allRawPositionsFlat.filter(
      (position) => position.amount > 0
    );

    const { collectibles, collections, names } =
      await buildObjectsFromPositions(rawPositions, []);

    let newObject = {
      sale: [],
      auction: [],
      raffle: [],
      loan: [],
    };
    let keys = Object.keys(newObject);
    rawPositions.forEach((position) => {
      if (position.state === 1) {
        position.saleData = { price: position.price };
        position.auctionData = null;
        position.raffleData = null;
        position.loanData = null;
      } else if (position.state === 2) {
        position.auctionData = auctionDatas.auctionDatas.get(
          position.positionId
        );
        const highestBidderName =
          names[position.auctionData.highestBidder.address];
        position.auctionData.highestBidder.name =
          highestBidderName || position.auctionData.highestBidder.address;
        position.saleData = null;
        position.raffleData = null;
        position.loanData = null;
      } else if (position.state === 3) {
        position.raffleData = raffleDatas.raffleDatas.get(position.positionId);
        position.saleData = null;
        position.auctionData = null;
        position.loanData = null;
      } else {
        position.loanData = loanDatas.loanDatas.get(position.positionId);
        const lenderName = names[position.loanData.lender.address];
        position.loanData.lender.name =
          lenderName || position.loanData.lender.address;
        position.saleData = null;
        position.auctionData = null;
        position.raffleData = null;
      }

      const positionObject = {
        positionId: position.positionId,
        itemId: position.itemId,
        tokenId: position.tokenId,
        collection:
          collections[
            collectionsOfApprovedItems[
              approvedIds.find((i) => i.id === position.itemId).collection
            ]
          ],
        creator: {
          address: position.itemCreator,
          avatar: getAvatar(position.itemCreator),
          name: names[position.itemCreator] || position.itemCreator,
        },
        owner: {
          address: position.owner,
          avatar: getAvatar(position.owner),
          name: names[position.owner] || position.owner,
        },
        amount: position.amount,
        sale: position.saleData,
        auction: position.auctionData,
        raffle: position.raffleData,
        loan: position.loanData,
        marketFee: position.marketFee,
        state: position.state,
        meta: collectibles[position.itemId.toString()]?.meta,
      };
      newObject[keys[position.state - 1]].push(positionObject);
    });

    res.status(200).json({
      ...newObject,
    });
  } catch (err) {
    console.log("marketplace 2 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchFeatured = async (_req, res) => {
  try {
    const featuredPromises = featuredIds.map((id) =>
      fetchPosition({ params: { positionId: id } })
    );
    let featured = await Promise.all(featuredPromises);
    featured = featured.map((item, i) => {
      return item || { positionId: featuredIds[i] };
    });
    res.status(200).json({
      featured,
    });
  } catch (err) {
    console.log("marketplace 3 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchPositions = async (req, res) => {
  const { type, ownerAddress, collectionId } = req.params;
  console.log("ownerAddress /get/marketplace/by-collection", ownerAddress)
  const state = Number(type);
  const startFrom = Number(req.query.startFrom) || 0;
  const limit = Math.min(Number(req.query.limit), 100) || 10;
  const { traits } = req.query;
  let searchItemIds = new Set();
  try {
    if (traits && Object.keys(traits).length) {
      searchItemIds = await grabItemsWithTraits(traits, collectionId);
    } else if (collectionId) {
      for (let i = 0; i < approvedIds.length; i++) {
        if (
          collectionsOfApprovedItems[approvedIds[i].collection] === collectionId
        ) {
          searchItemIds.add(approvedIds[i].id);
        }
      }
    }

    // This code resets the items for certain collection to all items
    // if (Array.isArray(approvedIds)) {
    //   searchItemIds = new Set(approvedIds.map((item) => item.id));
    // } else {
    //   console.error("approvedIds is not an array");
    // }

    if (!Array.from(searchItemIds).length)
      return res.status(200).json({
        items: [],
        pagination: {
          lowest: 0,
          limit,
        },
      });

    let collection = collectionId ? await getDbCollections([collectionId]) : [];
    let collectionCreator = ethers.constants.AddressZero;
    if (collection.length) {
      collectionCreator = collection[0].data.owner;
    }

    let rawPositions = await doQuery(
      positionsByStateQuery(
        state,
        ownerAddress || ethers.constants.AddressZero,
        startFrom,
        startFrom ? Math.min(limit, startFrom) : limit,
        Array.from(searchItemIds),
        collectionCreator
      )
    );

    rawPositions = rawPositions.map((position) => {
      return {
        ...position,
        saleData: null,
        auctionData: null,
        raffleData: null,
        loanData: null,
      };
    });

    const positionIds = rawPositions.map((position) => position.positionId);
    const additionalNamesSearch = [];
    if (state === 1) {
      for (let i = 0; i < rawPositions.length; i++) {
        const position = rawPositions[i];
        rawPositions[i] = {
          ...position,
          saleData: { price: position.price },
        };
      }
    } else if (state === 2) {
      const data = await getAuctionDatas(positionIds);
      for (let i = 0; i < rawPositions.length; i++) {
        const position = rawPositions[i];
        rawPositions[i] = {
          ...position,
          auctionData: data.auctionDatas.get(position.positionId),
        };
      }
      additionalNamesSearch.push(...data.highestBidders);
    } else if (state === 3) {
      const data = await getRaffleDatas(positionIds);
      for (let i = 0; i < rawPositions.length; i++) {
        const position = rawPositions[i];
        rawPositions[i] = {
          ...position,
          raffleData: data.raffleDatas.get(position.positionId),
        };
      }
    } else if (state === 4) {
      const data = await getLoanDatas(positionIds);
      for (let i = 0; i < rawPositions.length; i++) {
        const position = rawPositions[i];
        rawPositions[i] = {
          ...position,
          loanData: data.loanDatas.get(position.positionId),
        };
      }
      additionalNamesSearch.push(...data.lenders);
    }

    const { collectibles, collections, names } =
      await buildObjectsFromPositions(rawPositions, additionalNamesSearch);
    var positions = [];
    for (let i = 0; i < rawPositions.length; i++) {
      const position = rawPositions[i];
      if (position.state === 2) {
        const highestBidderName =
          names[position.auctionData.highestBidder.address] ||
          position.auctionData.highestBidder.address;
        position.auctionData.highestBidder.name =
          highestBidderName || position.auctionData.highestBidder.address;
      } else if (position.state === 4) {
        const lenderName =
          names[position.loanData.lender.address] ||
          position.loanData.lender.address;
        position.loanData.lender.name =
          lenderName || position.loanData.lender.address;
      }
      if (!collectibles[position.itemId.toString()]) {
        console.log(
          "POS id=",
          position.itemId.toString(),
          " meta=",
          collectibles[position.itemId.toString()]?.meta,
          " id=",
          position.itemId,
          position.positionId,
          position.tokenId
        );
        continue;
      }
      positions.push({
        positionId: position.positionId,
        itemId: position.itemId,
        tokenId: position.tokenId,
        collection:
          collections[
            collectionsOfApprovedItems[
              approvedIds.find((i) => i.id === position.itemId).collection
            ]
          ],
        creator: {
          address: position.itemCreator,
          avatar: getAvatar(position.itemCreator),
          name: names[position.itemCreator] || position.itemCreator,
        },
        owner: {
          address: position.owner,
          avatar: getAvatar(position.owner),
          name: names[position.owner] || position.owner,
        },
        amount: position.amount,
        sale: position.saleData,
        auction: position.auctionData,
        raffle: position.raffleData,
        loan: position.loanData,
        marketFee: position.marketFee,
        state: state,
        meta: collectibles[position.itemId.toString()]?.meta,
      });
    }
    // positions = positions.filter((p)=>p.collection.owner==p.creator.address)
    res.status(200).json({
      items: positions,
      pagination: {
        lowest: startFrom + limit + 1,
        limit,
      },
    });
  } catch (err) {
    console.log("marketplace 4 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchBalance = async (req, res) => {
  const { address } = req.user;
  try {
    let balance = await doQuery(balanceQuery(address));
    res.status(200).json({
      balance,
    });
  } catch (err) {
    console.log("marketplace 5 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchWithdrawable = async (req, res) => {
  let { evmAddress, address } = req.user;
  try {
    if (!evmAddress) evmAddress = await getEVMAddress(address);
    const balance = await doQuery(withdrawableQuery(evmAddress));
    res.status(200).json({
      balance,
    });
  } catch (err) {
    console.log("marketplace 6 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchBidsByOwner = async (req, res) => {
  const { evmAddress } = req.user;
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 10;
  try {
    const response = await doQuery(
      bidsByBidder(evmAddress, (page - 1) * pageSize, pageSize)
    );

    const metas = await getDbCollectibles(
      response.bids.map((bid) => bid.itemId)
    );
    let bids = response.bids.map((bid, i) => {
      return {
        ...bid,
        meta: metas[i],
      };
    });

    res.status(200).json({
      bids,
      pagination: {
        totalPages: Math.ceil(response.totalCount / pageSize),
        page,
        pageSize,
      },
    });
  } catch (err) {
    console.log("marketplace 7 ERR=", err);
    res.json({
      error: err.toString(),
    });
  }
};

const fetchClaimable = async (req, res) => {
  const { evmAddress } = req.user;
  if (!evmAddress) {
    res.status(400);
    return;
  }
  try {
    const claimable = await getClaimableItems(evmAddress);
    res.status(200).json(claimable);
  } catch (err) {
    console.log("marketplace 8 ERR=", err);
    res.status(404).json({
      error: err.toString(),
    });
  }
};

const fetchClaimableCount = async (req, res) => {
  const { evmAddress } = req.user;
  try {
    const count = await getClaimableItemsCount(evmAddress);
    res.status(200).json({
      count,
    });
  } catch (err) {
    console.log("marketplace 9 ERR=", err);
    res.status(404).json({
      error: err.toString(),
    });
  }
};

const healthCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 6, // limit each IP to 3 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const health = async (_req, res) => {
  res.status(200).send("OK");
};

const statswatchHealth = async (_req, res) => {
  const { provider } = await getWallet();
  const [currentBlockNumber, lastUpdatedBlock] = await Promise.all([
    provider.getBlockNumber(),
    firebase.collection("statswatch-info").doc("block").get(),
  ]);
  const lastUpdatedBlockNumber = lastUpdatedBlock.data().lastUpdated;
  const diff = currentBlockNumber - lastUpdatedBlockNumber;
  if (diff > 50) {
    res.status(500).send("Statswatch is not up to date");
  } else {
    res.status(200).send("OK");
  }
};

const automodHealth = async (req, res) => {
  const lastUpdated = await firebase
    .collection("automod-info")
    .doc("health")
    .get();
  const lastUpdatedTime = lastUpdated.data().lastUpdated;
  if (Date.now() - lastUpdatedTime.seconds * 1000 > 1000 * 60 * 10) {
    res.status(500).send("Automod is not up to date");
  } else {
    res.status(200).send("OK");
  }
};

const getCollectionCount = async (req, res) => {
  try {
    const { owner, positionId } = req.params;
    const response = await doQuery(
      getCollectionAmountFromUser(owner, toIndexerId(positionId))
    );
    return res.send(response);
  } catch (error) {
    console.log("getCollectionCount ERR=", error);
    return res.status(200).send([{ amount: 0 }]);
  }
};

module.exports = {
  router: () => {
    const router = Router();
    router.get("/featured", fetchFeatured);
    router.get("/summary", fetchSummary);
    router.get("/is-whitelisted/:id", isWhitelistedItem);
    router.get("/all/:type", fetchPositions);
    router.get("/by-owner/:ownerAddress/:type", fetchPositions);
    router.get("/by-collection/:collectionId/:type", fetchPositions);
    router.get("/position/:positionId", fetchPosition);
    router.get("/collection/:collectionId", fetchCollection);
    router.get("/collection/:collectionId/stats", fetchCollectionStats);
    router.get("/balance", verify, fetchBalance);
    router.get("/withdrawable", verify, fetchWithdrawable);
    router.get("/bids", verify, fetchBidsByOwner);
    router.get("/claimables", verify, fetchClaimable);
    router.get("/claimables/count", verify, fetchClaimableCount);
    router.get("/available-collection/:owner/:positionId", getCollectionCount);
    router.get("/health", healthCheckLimiter, health);
    router.get("/health/statswatch", healthCheckLimiter, automodHealth);
    router.get("/health/automod", healthCheckLimiter, automodHealth);
    return router;
  },
  getDbCollections,
  getDbCollectibles,
  getNamesByEVMAddresses,
  sliceIntoChunks,
};
``