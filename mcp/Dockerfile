# nightstrix-mcp — small read-only MCP facade over go2rtc.
FROM node:22-alpine

WORKDIR /app

# Install production deps only, reproducibly from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production \
    MCP_PORT=8390 \
    MCP_BIND=0.0.0.0 \
    GO2RTC_URL=http://go2rtc:1984 \
    CAMS_FILE=/config/cams.js

EXPOSE 8390
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_PORT||8390)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
