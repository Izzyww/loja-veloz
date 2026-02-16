# Loja Veloz – Plataforma de Pedidos (Microsserviços)

Arquitetura de referência: microsserviços (Order, Inventory), Docker Compose local, Kubernetes (EKS) em produção, CI/CD com GitHub Actions e observabilidade (Prometheus, OpenTelemetry/Jaeger).

## Estrutura do Projeto

```
loja-veloz/
├── api-gateway/          # (Nginx via docker-compose)
├── order-service/        # Microsserviço de Pedidos
├── inventory-service/    # Microsserviço de Estoque
├── docker-compose.yml    # Ambiente local
├── nginx.conf            # Configuração do Gateway local
├── init-scripts/         # Scripts SQL iniciais (Postgres)
├── infra/
│   ├── k8s/              # Manifestos Kubernetes (Deployments, Services, Ingress, HPA)
│   └── terraform/        # Terraform (VPC + EKS)
└── .github/workflows/    # Pipeline CI/CD
```

## Pré-requisitos

- Docker e Docker Compose
- Node.js 18+ (para desenvolvimento local sem Docker)
- Para produção: `kubectl`, `terraform`, `aws-cli`

## Ambiente Local (Docker Compose)

1. **Subir a stack:**
   ```bash
   docker-compose up --build
   ```

2. **Validação:**
   - RabbitMQ UI: http://localhost:15672 (user/password)
   - API Gateway: http://localhost:8080
   - Order Service: http://localhost:8080/api/orders/ ou http://localhost:3001
   - Inventory Service: http://localhost:8080/api/inventory/ ou http://localhost:3002

3. **Exemplo de uso:**
   ```bash
   curl -X POST http://localhost:8080/api/orders/ -H "Content-Type: application/json" -d "{\"customer_id\":\"cli-1\",\"total_cents\":9999}"
   curl http://localhost:8080/api/orders/
   ```

Com o mapeamento de volumes (`./order-service:/app`), alterações no código disparam hot reload (nodemon).

## Produção (Kubernetes / EKS)

### 1. Infraestrutura (Terraform)

```bash
cd infra/terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
aws eks update-kubeconfig --region us-east-1 --name veloz-cluster
```

### 2. Namespace e segredos (uma vez)

```bash
kubectl apply -f infra/k8s/namespace.yaml

# Segredos (não versionar valores reais)
kubectl create secret generic db-secrets \
  --from-literal=database_url='postgresql://user:senha@rds-endpoint:5432/veloz_db' \
  -n veloz-ns
kubectl create secret generic rabbitmq-secrets \
  --from-literal=rabbitmq_url='amqp://user:senha@rabbitmq-service:5672' \
  -n veloz-ns
```

### 3. Ingress e aplicação

Instalar o Ingress Controller (ex.: NGINX) e aplicar os manifestos:

```bash
kubectl apply -f infra/k8s/
```

### 4. CI/CD (GitHub Actions)

O pipeline em `.github/workflows/deploy.yml`:

- **Push/PR na `main`:** testes e lint em `order-service` e `inventory-service`.
- **Push na `main`:** build das imagens Docker, push para GHCR e deploy no EKS (`kubectl set image` + `rollout status`).

Configurar no repositório os secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. O `GITHUB_TOKEN` já é fornecido pelo GitHub para push em GHCR.

## Observabilidade

- **Health:** `GET /health` e `GET /ready` em cada microsserviço (usados pelas probes do Kubernetes).
- **Métricas:** `GET /metrics` (formato Prometheus); os Services em `infra/k8s` têm anotações para scrape.
- **Tracing:** OpenTelemetry pode ser ativado nos serviços (ver comentários em `order-service/src/instrumentation.ts` e instalar os pacotes OTel); em produção, apontar para o Jaeger/OTel Collector.

## Segurança

- Dockerfiles de produção: multi-stage build, usuário não-root (`velozuser`), apenas dependências de produção.
- Kubernetes: `securityContext` com `runAsNonRoot`, namespace com Pod Security Admission (baseline).
- Credenciais via Kubernetes Secrets e GitHub Secrets; nada de senhas no código ou no Git.

## Referência

Este projeto materializa o relatório técnico *Entrega Contínua de uma Plataforma de Pedidos em Microsserviços: Do Docker Compose ao Kubernetes com Observabilidade e CI/CD* (Loja Veloz / Pedidos Veloz).
