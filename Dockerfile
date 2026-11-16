FROM node:20-alpine
#WORKDIR não cria um novo projeto mas sim uma pasta ao qual ele ira operar o sistema
WORKDIR /app 

#COPY ira mandar os arquivos para a pasta /app recem criada
COPY package.json ./
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]