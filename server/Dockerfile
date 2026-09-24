FROM node:20-alpine
WORKDIR /app
# npm ci: tái lập đúng phiên bản từ package-lock.json (tái lập build) [F11]
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY index.js ./
# thư mục lưu data.json — volume mount vào đây; chown cho user node
RUN mkdir -p /app/data && chown -R node:node /app
ENV DATA_FILE=/app/data/data.json
# non-root user (F11)
USER node
EXPOSE 3000
# HEALTHCHECK: giám sát tầng Docker (bổ sung cho healthcheck web)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "index.js"]
