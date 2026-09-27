# Production (Dokku). For development use Dockerfile.dev, which is what
# docker-compose.yaml builds — there the files come in through a volume, here
# they are baked into the image.
#
# The site has no dependencies and no build step: it is HTML/CSS/JS served by
# server.js, which only uses the stdlib. Hence a single stage, no npm install.
FROM node:22.23.3-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /usr/src/app

# IG_TOKEN_FILE points here: this is where the refreshed Instagram token is
# written. On Dokku, mount a volume at this path so the token survives deploys:
#   dokku storage:ensure-directory site-croche
#   dokku storage:mount site-croche /var/lib/dokku/data/storage/site-croche:/usr/src/app/secrets
RUN mkdir -p /usr/src/app/secrets

COPY server.js ./
COPY src ./src

RUN chown -R appuser:appgroup /usr/src/app

ENV NODE_ENV=production
ENV IG_TOKEN_FILE=/usr/src/app/secrets/ig-token

EXPOSE 8080

USER appuser

CMD ["node", "server.js"]
