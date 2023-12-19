const { execute } = require ('apollo-link');
const { WebSocketLink } = require ('apollo-link-ws');
const { SubscriptionClient } = require ('subscriptions-transport-ws');
const ws = require ('ws');

// oh i hate this
// process.env ['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

const createSubscriptionObservable = (wsurl, query, variables) => {
    const link = new WebSocketLink (new SubscriptionClient (wsurl, {
        reconnect: true,
    }, ws));
    return execute (link, { query: query, variables: variables });
};

module.exports = {
    createSubscriptionObservable
};