FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js ./
# thư mục lưu data.json (volume mount vào đây)
RUN mkdir -p /app/data
ENV DATA_FILE=/app/data/data.json
EXPOSE 3000
CMD ["node", "index.js"]
