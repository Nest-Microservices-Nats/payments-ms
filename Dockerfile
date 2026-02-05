
FROM node:24-alpine3.22

WORKDIR /usr/src/app

COPY package.json  ./
COPY yarn.lock  ./

RUN yarn

COPY . .

EXPOSE 3003