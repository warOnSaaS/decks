FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Chromium for PDF export and slide previews (Playwright's build, with the system libraries it needs).
RUN npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/* && chmod -R a+rX /ms-playwright
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=3996 SQLITE_FILE=/data/decks.db FILES_DIR=/data/files
EXPOSE 3996
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
