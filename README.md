# Mural Urutaí

Site em tempo real que monitora as notícias do IF Goiano – Campus Urutaí.

## Rodar
Requer Node.js 18+ (sem dependências para instalar).

    node server.js
    # abra http://localhost:3000

Opções (variáveis de ambiente): `PORT`, `REFRESH_MINUTES` (padrão 20), `INSECURE_TLS=1` (se o certificado do site der erro).

## Atalhos
- Windows: dois cliques em `iniciar.bat` (inicia o servidor e abre o navegador).
- Linux/Mac: `./iniciar.sh`

Importante: mantenha a janela do servidor aberta enquanto usa o site, e acesse por `http://localhost:3000`.

## Histórico
As notícias ficam salvas em `data/news.json`. Na primeira execução o servidor lê as páginas antigas
do site (`?start=10`, `20`, …) em segundo plano, uma a cada ~1,5 s, e guarda tudo. Nas próximas vezes
só confere as novidades. Para reler todo o arquivo do zero: `REBACKFILL=1 node server.js`.
