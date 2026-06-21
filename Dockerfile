FROM node:20-alpine
# openssl: Prisma engine · git + bash: the agent shells out to git for per-shop
# theme version history (restore/undo) and uses bash for its Bash tool.
RUN apk add --no-cache openssl git bash

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install ALL deps (the build needs vite + @react-router/dev), build, then prune
# dev deps so the runtime image stays lean. Prisma + the Agent SDK are runtime
# deps, so they survive the prune.
RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev && npm cache clean --force

CMD ["npm", "run", "docker-start"]
