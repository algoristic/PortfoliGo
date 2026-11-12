import { environment as productionEnvironment } from './environment.prod';

describe('environment', () => {
  describe('production', () => {
    it('ships without store devtools', () => {
      expect(productionEnvironment.production).toBe(true);
      expect(productionEnvironment.storeDevtools).toBeNull();
    });
  });
});
