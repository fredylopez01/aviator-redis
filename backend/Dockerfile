FROM node:18

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json primero (para cache de dependencias)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start"]
