FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node app.js ./
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node db ./db
COPY --chown=node:node lib ./lib
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node scripts/grant-admin.js ./scripts/grant-admin.js
USER node
EXPOSE 8080
CMD ["node", "app.js"]
