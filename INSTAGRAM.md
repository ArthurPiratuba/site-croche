# Ligar o feed do Instagram

A seção `#instagram` já está pronta e funciona sem token: nesse caso ela some
e sobra o aviso + botão para o perfil. Para mostrar os posts de verdade,
falta só um token.

## Por que precisa de token

Não existe endpoint público que devolva os posts de uma conta. Raspar o HTML do
`instagram.com` não funciona (tem muro de login) e viola os termos. A API
*Basic Display*, que era o caminho simples, foi desligada pela Meta em
**4 de dezembro de 2024**. Hoje o único caminho é a **Instagram API with
Instagram Login**, que exige:

1. A conta `@__fernandacroche__` ser **Profissional** (Comercial ou Criador de
   conteúdo). É grátis e se muda dentro do app: Configurações → Tipo de conta.
2. Um app no [developers.facebook.com](https://developers.facebook.com) com o
   produto **Instagram** adicionado.
3. Gerar um token de longa duração (60 dias) com a permissão
   `instagram_business_basic`, em Instagram → Configuração da API.

## Configurar

```bash
echo 'IG_TOKEN=SEU_TOKEN_AQUI' > .env
docker compose up -d --build
```

O `docker-compose.yaml` lê o `.env` automaticamente. O `.gitignore` já ignora
`.env` e `.secrets/`.

Confira:

```bash
curl -s localhost:50407/api/instagram | head -c 400
```

- `{"posts":[...]}` → funcionando.
- `{"posts":[],"motivo":"sem-token"}` → o token não chegou no container.
- `{"posts":[],"motivo":"erro"}` → token inválido ou expirado; veja
  `docker compose logs` para a mensagem da Meta.

## Renovação

O token vence em 60 dias. O servidor chama `refresh_access_token` no boot e a
cada 24h, e grava o token novo em `IG_TOKEN_FILE` — que passa a ter precedência
sobre o `IG_TOKEN` do ambiente. Ou seja: enquanto o container subir pelo menos
uma vez a cada 60 dias, não precisa mexer.

Esse arquivo é **o motivo da pasta `.secrets/` existir**: sem ela, cada restart
voltaria ao token original do `.env`, que um dia morre. Em dev fica em
`.secrets/ig-token` (na raiz do projeto, ignorada pelo git); em produção, em
`/usr/src/app/secrets/ig-token`, que precisa de volume no Dokku — veja abaixo.

Se passar dos 60 dias parado, a renovação falha (a Meta não renova token morto)
e é preciso gerar um novo token e apagar o arquivo.

## Produção (Dokku)

O `Dockerfile` é o de produção; o `Dockerfile.dev` é o que o `docker-compose.yaml` usa.

```bash
dokku apps:create site-croche
dokku config:set site-croche IG_TOKEN=SEU_TOKEN_AQUI IG_LIMIT=9 IG_CACHE_MIN=30

# volume para o token renovado sobreviver ao deploy
dokku storage:ensure-directory site-croche
dokku storage:mount site-croche \
  /var/lib/dokku/data/storage/site-croche:/usr/src/app/secrets

git remote add dokku dokku@SERVIDOR:site-croche
git push dokku main
```

O `IG_TOKEN_FILE` já vem apontado para `/usr/src/app/secrets/ig-token` na
imagem, então não precisa configurar. A porta também: o `EXPOSE 8080` é o que o
Dokku usa para mapear o app.

## Detalhes da implementação

- O token fica só no servidor; o navegador chama `/api/instagram`.
- A resposta fica 30 min em cache na memória (`IG_CACHE_MIN`), então o tráfego
  do site não bate na API da Meta.
- Se a API falhar mas houver cache antigo, o cache antigo é servido
  (`motivo: "cache-antigo"`) em vez de uma grade vazia.
- `IG_LIMIT` controla quantos posts vêm (padrão 9).
- As URLs de imagem do CDN da Meta expiram em alguns dias — por isso o feed é
  buscado de novo a cada 30 min em vez de ser salvo em disco.
