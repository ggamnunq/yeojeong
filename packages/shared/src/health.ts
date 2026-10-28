export interface HealthResponse {
  status: 'ok';
  db: 'up' | 'down';
}
