const { Router } = require ('express');
const { doQuery, salesQuery, lastSaleQuery, itemQuery, tokenHoldersCountQuery } = require('../../lib/graphqlApi');

const grabCollectibleOwners = async id => {
    const { tokenId, nftContract } = await doQuery (itemQuery (id));
    return await doQuery (tokenHoldersCountQuery (tokenId, nftContract));
}

const computeSalesData = (sales) => {
    let totalAmount = 0; 
    let totalVolume = 0;
    for (let sale of sales) {
        totalAmount += sale.amount;
        totalVolume += sale.amount * sale.price;
    }

    const averagePrice = totalVolume / totalAmount;

    return {
        volume: totalVolume, 
        average: Number(averagePrice.toFixed(2)) || 0 ,
        salesAmount: totalAmount 
    };
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

    const { volume, average, salesAmount } = computeSalesData (sales);
    const collectibleAllStats = {
        volume,
        average,
        salesAmount,
        lastSale,
        owners
    };

    res?.json (collectibleAllStats);
}


module.exports = () => {
    const router = Router ();

    router.get ('/collectible/:id/sale-history', getCollectibleSaleHistory);
    router.get ('/collectible/:id/all', getCollectibleAllStats);

    return router;
}