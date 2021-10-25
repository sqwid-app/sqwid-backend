# Sqwid backend

## API docs baby

### Nonce
```sh
GET /api/nonce
```

### Auth
```sh
POST /api/auth
```
**BODY:**
```json
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
```json
Authorization: Bearer <jwt>
```
**BODY**
```json
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
```json
Authorization: Bearer <jwt>
```
**BODY**
```json
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