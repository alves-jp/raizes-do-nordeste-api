// Ambiente dos testes automatizados: gateway rápido e segredo próprio.
// Executado antes de qualquer import da aplicação (jest.setupFiles).
process.env.JWT_SECRET = 'segredo-dos-testes-automatizados-0123456789';
process.env.PAYMENT_GATEWAY_LATENCY_MS = '5';
process.env.PAYMENT_GATEWAY_TIMEOUT_MS = '300';
process.env.PAYMENT_GATEWAY_RETRIES = '1';
process.env.LOGIN_MAX_TENTATIVAS = '5';
process.env.LOGIN_BLOQUEIO_MINUTOS = '15';
