# Sqwid backend

## Run Locally

Build Image `docker build . -t sqwid-server`

Run Image `docker run -p 8080:8080 sqwid-server`

Change Env `docker run -p 8080:8080 --env NETWORK=reef_testnet sqwid-server`
_ pass env vars on runtime using --env flag _

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