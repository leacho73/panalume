# Panalume without Home Assistant OS (Home Assistant Container / Core): a
# standalone image that talks to Home Assistant with a long-lived token.
# Published as ghcr.io/leacho73/panalume. The app's own image (panalume/Dockerfile)
# is the one Home Assistant's Supervisor builds; this one is separate so the two
# can't affect each other.
#
#   docker run -d --name panalume -p 8099:8099 -v panalume:/data \
#     -e HA_URL=http://192.168.1.10:8123 -e HA_TOKEN=<long-lived token> \
#     ghcr.io/leacho73/panalume
#
# There's no login: anyone who can reach the port can use (and edit) the
# dashboard with the token's access. Only run it on a network you trust.

# The build output is plain JavaScript, so it's built once on the build
# machine and copied into each architecture's image.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY panalume/app/package*.json ./
RUN npm ci
COPY panalume/app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8099 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
LABEL org.opencontainers.image.source="https://github.com/leacho73/panalume" \
      org.opencontainers.image.description="Panalume: a Home Assistant dashboard you design in the browser"
VOLUME /data
EXPOSE 8099
CMD ["node", "server/index.js"]
