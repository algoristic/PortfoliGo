import { environment as developmentEnvironment } from './environment';
import { environment as productionEnvironment } from './environment.prod';

describe('environment', () => {
  describe('production', () => {
    it('disables store devtools and enables developer pages for now', () => {
      expect(productionEnvironment.production).toBe(true);
      expect(productionEnvironment.storeDevtools).toBeNull();
      expect(productionEnvironment.devPages).toBe(true);
    });
  });

  describe('development', () => {
    it('enables store devtools and developer pages', () => {
      expect(developmentEnvironment.production).toBe(false);
      expect(developmentEnvironment.storeDevtools).not.toBeNull();
      expect(developmentEnvironment.devPages).toBe(true);
    });
  });
});
