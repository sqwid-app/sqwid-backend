FROM node:18 as builder
RUN apt-get update && apt-get -y upgrade
RUN apt-get install -y node-gyp

WORKDIR /usr/server

COPY package.json yarn.lock ./
RUN yarn install
COPY . ./
EXPOSE 8080

ENTRYPOINT ["yarn", "start"]