# AssetTrack QR - Controle de Ativos e Inventário

Sistema moderno de gestão de ativos e inventário com leitor óptico de código de barras/QR Code, OCR inteligente e sincronização segura com Firebase Firestore.

---

## 🔒 Segurança e Repositório Público

Este repositório está configurado para **NÃO expor nenhuma credencial ou chave privada**. Todas as credenciais do Firebase e chaves de API devem ser fornecidas por meio de variáveis de ambiente.

### Variáveis de Ambiente Necessárias

Crie um arquivo `.env` local (baseado no `.env.example`) ou adicione os segredos na sua plataforma de hospedagem / **GitHub Actions Secrets**:

| Variável | Descrição | Onde Configurar |
|---|---|---|
| `GEMINI_API_KEY` | Chave de API do Google Gemini (OCR / IA) | Backend (Express / Cloud Run) |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | Frontend / GitHub Secrets |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domínio de Auth do Firebase (`*.firebaseapp.com`) | Frontend / GitHub Secrets |
| `VITE_FIREBASE_PROJECT_ID` | ID do Projeto no Firebase | Frontend / GitHub Secrets |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket do Cloud Storage | Frontend / GitHub Secrets |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID do remetente do Firebase Messaging | Frontend / GitHub Secrets |
| `VITE_FIREBASE_APP_ID` | ID da aplicação web do Firebase | Frontend / GitHub Secrets |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | ID do Banco Firestore (opcional, padrão: `(default)`) | Frontend / GitHub Secrets |

---

## 🛡️ Regras de Segurança do Firebase (Firestore)

As regras de segurança do Firestore (`firestore.rules`) garantem:
- **Bloqueio total de acesso público ou não autenticado**.
- **Acesso administrativo e operacional restrito** exclusivamente à conta Google autorizada: `gibasuporte@gmail.com` com e-mail verificado (`request.auth.token.email_verified == true`).
- Validação estrutural de todos os campos gravados no banco de dados.

---

## 🚀 Como Executar Localmente

**Pré-requisitos:** Node.js (v18+)

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/asset-track-qr.git
   cd asset-track-qr
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie seu arquivo `.env`:
   ```bash
   cp .env.example .env
   # Preencha suas credenciais no arquivo .env
   ```

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

5. Acesse a aplicação em `http://localhost:3000`.

