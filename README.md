# OSUK — Novo deploy pronto com BukioPay

## Publique em 3 passos

1. Extraia OSUK-NOVO-DEPLOY-BUKIOPAY.zip. Envie TODO o conteúdo da pasta OSUK-NOVO-DEPLOY para a raiz de um repositório privado novo no GitHub. Não envie o ZIP nem apenas public/. O GitHub deve mostrar public/, api/, osuk-server/, scripts/, package.json e vercel.json na raiz.
2. Vercel → Add New → Project: importe esse repositório e mantenha a Root Directory na raiz. O arquivo vercel.json já configura instalação, build, publicação e funções. Não precisa definir manualmente comandos ou Output Directory.
3. Antes de clicar em Deploy, adicione a variável BUKIOPAY_API_KEY e cole a chave completa bk_live_... da BukioPay como valor, sem escrever Bearer. Publique. Essa é a única variável de ambiente necessária.

A chave precisa das permissões payments:create e payments:get no grupo Cobranças. A conta BukioPay deve estar apta a receber Pix. Se adicionar a variável depois do primeiro deploy, faça Redeploy. Nenhuma chave real está incluída neste pacote.

## O endereço é automático

O site e a API reconhecem o domínio do novo projeto, inclusive domínio próprio ou URL de preview acessível. Não é necessário cadastrar APP_URL, siteUrl, endereço de callback, webhook ou banco de dados. A Vercel fornece Host para o servidor; a compra só aceita Origin do mesmo domínio HTTPS. O frontend usa /api no próprio domínio e monta seus links sem apontar para projetos anteriores.

Depois de publicar, abra /api/health no domínio NOVO. Deve retornar provider BukioPay e configuration_present. Isso comprova que a variável está preenchida; não comprova validade da chave nem pagamento real. Para testar a compra, abra /pagamento.html?pack=ultra no mesmo domínio. Previews podem depender das preferências de proteção de acesso da sua conta Vercel.

## Site inteiro

Todas as 8 páginas, imagens, logo animada, favicon, packs e preços, descontos, cronômetro, avaliações, Discord, gráficos, formulário de e-mail, QR Code/copia e cola, foguete de aprovação e chat com tutorial/download estão incluídos. O pack só é liberado após GET autenticado confirmar paid com ID, valor e descrição correspondentes.

Esta é a pasta do novo projeto com BukioPay. Recibos antigos de OUTROS gateways continuam pertencendo aos projetos anteriores; este deploy não consulta esses gateways. Recibos BukioPay podem ser consultados enquanto a chave da BukioPay permanecer a mesma e o acesso válido estiver disponível. O conteúdo do site não foi reduzido.

## Pagamento e entrega

Ultra R$35,90 (3590 centavos), Valorant R$22,90 (2290), Completo R$17,90 (1790). Backend fixo BukioPay https://bukio.up.railway.app/v1, Authorization Bearer. POST /payments envia amount, method pix, description e Idempotency-Key persistido para a tentativa. GET /payments/{id} confirma o status. QR Code é calculado do copyPaste real retornado, com prazo expiresAt do provedor; não é gerada chave fictícia. Total e taxa são exibidos a partir da resposta recebida, sem estimar tarifas.

O acesso criptografado dura 30 dias e fica na sessão da aba. A troca da API key invalida esses acessos. Não existe envio ou recuperação por e-mail integrado; pack e tutorial são entregues no chat. Mantenha a mesma sessão e e-mail para recuperar uma tentativa; não prometa retenção ilimitada da idempotência do provedor. Não fazemos saques, transferências ou criação de subcontas.

A confirmação usa consulta a cada 60 segundos por até 10 minutos enquanto a página está visível, além de Atualizar pagamento manual. Não exige webhook ou banco. Reembolso/expiração/status inesperado bloqueiam nova exibição dos links. Links de Drive e YouTube podem ser compartilhados após recebidos; não é possível revogá-los por esta integração.

## Diagnóstico

configuration_required em /api/health: cadastre BUKIOPAY_API_KEY no ambiente utilizado e publique novamente. HTTP401: confira a API key e validade. HTTP403: confira permissões, restrição de IP e verificação da conta. HTTP422: dados recusados pela BukioPay. HTTP500: confira o serviço do provedor. A configuração da Vercel não substitui a ativação da conta BukioPay. Nunca envie a chave ao suporte ou no chat; compartilhe somente código/mensagem do erro.

O build confere todas as páginas, recursos locais, arquivos privados e APIs. Testes de pagamento usam respostas simuladas e não geram cobrança real. O funcionamento real com sua conta ainda precisa ser validado depois do deploy.

Documentação BukioPay: https://bukio.up.railway.app/dashboard/integracoes/api
Configuração Vercel: https://vercel.com/docs/project-configuration/vercel-json
Domínio da requisição: https://vercel.com/docs/headers/request-headers#host
