# For the VPS. Not used by Vercel, which builds through its own pipeline.
#
# DOCKER_BUILD=1 is what flips next.config.ts to `output: "standalone"`, so the
# move off Vercel is a build flag rather than an edit to the app.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 DOCKER_BUILD=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install --include=dev --ignore-scripts && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
