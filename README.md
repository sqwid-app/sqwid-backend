# Sqwid backend

### example .env file
```
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
JWT_SECRET=
NFT_STORAGE_API_KEY=
COLLECTIBLE_CONTRACT_ADDRESS=0x192A6B3AA5A860F110A2479C32C29f790b21163b
MARKETPLACE_CONTRACT_ADDRESS=0xccc5309F6E92956970000d385D817438bbF7CeA9
UTILITY_CONTRACT_ADDRESS=0xc857bb5C1D062c465a1B3Cf8af19635cC3B8e1Bc
RPC_URL=wss://rpc-testnet.reefscan.com/ws
```

## API docs (not up to date)

### Nonce
```sh
GET /api/nonce
```

### Auth
```sh
POST /api/auth
```
**BODY:**
```js
{
    address: '',
    signature: ''
}
```


### Create
#### Collection
```sh
POST /api/create/collection
```
**HEADERS**
```sh
Authorization: Bearer <jwt>
```
**BODY**
```js
{
    name: '',
    description: '',
    fileData: [] // the image
}
```

#### Collectible
```sh
POST /api/create/collectible
```
**HEADERS**
```sh
Authorization: Bearer <jwt>
```
**BODY**
```js
{
    name: '',
    description: '',
    fileData: [] // the media (image / video / audio)
}
```

### Get

#### Collections

##### By owner
```sh
GET /api/get/collections/owner/:address
```

##### By name (returns all collections whose name starts with the given string)
```sh
GET /api/get/collections/name/:name
```


##### By ID
```sh
GET /api/get/collections/id/:id
```