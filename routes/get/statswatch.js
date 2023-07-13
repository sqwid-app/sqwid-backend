const { Router } = require ('express');
const { doQuery, salesQuery, lastSaleQuery, itemQuery, tokenHoldersCountQuery } = require('../../lib/graphqlApi');

const grabCollectibleOwners = async id => {
    const { tokenId, nftContract } = await doQuery (itemQuery (id));
    return await  doQuery (tokenHoldersCountQuery (tokenId, nftContract));
}

const computeVolumeFromSales = sales => {
    return sales.reduce ((acc, sale) => {
        return acc + (sale.amount * sale.price);
    }, 0);
}

const getCollectibleAverage = (sales) => {
    let totalAmount = 0; 
    let totalPrice = 0;
    for (let sale of sales) {
        totalAmount += sale.amount;
        totalPrice += sale.amount * sale.price;
    }

    const averagePrice = totalPrice / totalAmount;

    return Number(averagePrice.toFixed(2)) || 0;
}

const getCollectibleSaleHistory = async (req, res) => {
    const { id } = req.params;
    const sales = await doQuery (salesQuery (id));
    res?.json ({ sales });
}

const getCollectibleAllStats = async (req, res) => {
    const { id } = req.params;
    const sales = await doQuery (salesQuery (id));

    const [lastSale, owners] = await Promise.all ([
        doQuery (lastSaleQuery (id)),
        grabCollectibleOwners (id)
    ]);

    const collectibleAllStats = {
        volume: Number (computeVolumeFromSales (sales).toFixed (2)),
        average: getCollectibleAverage (sales),
        salesAmount: sales.length,
        lastSale: lastSale,
        owners: owners
    };

    res?.json (collectibleAllStats);
}


module.exports = () => {
    const router = Router ();

    router.get ('/collectible/:id/sale-history', getCollectibleSaleHistory);
    router.get ('/collectible/:id/all', getCollectibleAllStats);

    return router;
}