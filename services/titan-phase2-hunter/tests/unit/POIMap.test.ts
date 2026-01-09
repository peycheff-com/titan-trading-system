/**
 * POI Map Component Tests
 * Tests for the POI Map display component
 */

import { POIMapComponent, POIEntry } from '../../src/console/POIMap';

describe('POIMapComponent', () => {
  let component: POIMapComponent;

  beforeEach(() => {
    component = new POIMapComponent();
  });

  describe('render', () => {
    it('should render header and empty lines when no POIs', () => {
      const lines = component.render();
      
      expect(lines).toHaveLength(9); // 1 header + 8 data lines
      expect(lines[0]).toBe('Type      Price     Dist   Conf');
      expect(lines[1]).toBe(''.padEnd(31));
    });

    it('should render POI entries correctly', () => {
      const pois: POIEntry[] = [
        {
          id: 'OB_1',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 0.3,
          confidence: 85,
          age: 2,
          mitigated: false,
          strength: 90
        },
        {
          id: 'FVG_1',
          type: 'FVG',
          direction: 'BEARISH',
          price: 49500,
          distance: -1.2,
          confidence: 75,
          age: 1,
          mitigated: false,
          strength: 80
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      expect(lines).toHaveLength(9);
      expect(lines[0]).toBe('Type      Price     Dist   Conf');
      expect(lines[1]).toContain('OB-BULL');
      expect(lines[1]).toContain('50,000');
      expect(lines[1]).toContain('+0.3%');
      expect(lines[1]).toContain('85%');
      expect(lines[2]).toContain('FVG-BEAR');
      expect(lines[2]).toContain('49,500');
      expect(lines[2]).toContain('-1.2%');
      expect(lines[2]).toContain('75%');
    });

    it('should sort POIs by distance (closest first)', () => {
      const pois: POIEntry[] = [
        {
          id: 'POI_1',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 2.5, // Far
          confidence: 80,
          age: 1,
          mitigated: false,
          strength: 85
        },
        {
          id: 'POI_2',
          type: 'FVG',
          direction: 'BEARISH',
          price: 49800,
          distance: 0.2, // Close
          confidence: 90,
          age: 0.5,
          mitigated: false,
          strength: 95
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      // FVG should be first (closer distance)
      expect(lines[1]).toContain('FVG-BEAR');
      expect(lines[1]).toContain('+0.2%');
      // Order Block should be second (farther distance)
      expect(lines[2]).toContain('OB-BULL');
      expect(lines[2]).toContain('+2.5%');
    });

    it('should limit display to 8 POIs', () => {
      const pois: POIEntry[] = Array.from({ length: 12 }, (_, i) => ({
        id: `POI_${i}`,
        type: 'ORDER_BLOCK' as const,
        direction: 'BULLISH' as const,
        price: 50000 + i * 100,
        distance: i * 0.1,
        confidence: 80,
        age: 1,
        mitigated: false,
        strength: 85
      }));

      component.updateConfig({ pois });
      const lines = component.render();

      expect(lines).toHaveLength(9); // 1 header + 8 data lines
      
      // Check that only 8 POIs are displayed (plus header)
      let nonEmptyLines = 0;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() !== '') {
          nonEmptyLines++;
        }
      }
      expect(nonEmptyLines).toBe(8);
    });
  });

  describe('color coding', () => {
    it('should use red color for very close POIs (< 0.5%)', () => {
      const pois: POIEntry[] = [
        {
          id: 'CLOSE_POI',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 0.3, // < 0.5%
          confidence: 85,
          age: 1,
          mitigated: false,
          strength: 90
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      // Should contain red color code
      expect(lines[1]).toContain('\x1b[31m'); // Red color
    });

    it('should use yellow color for close POIs (< 2%)', () => {
      const pois: POIEntry[] = [
        {
          id: 'CLOSE_POI',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 1.5, // < 2%
          confidence: 75,
          age: 1,
          mitigated: false,
          strength: 80
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      // Should contain yellow color code
      expect(lines[1]).toContain('\x1b[33m'); // Yellow color
    });

    it('should use white color for far POIs (>= 2%)', () => {
      const pois: POIEntry[] = [
        {
          id: 'FAR_POI',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 3.0, // >= 2%
          confidence: 70,
          age: 1,
          mitigated: false,
          strength: 75
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      // Should contain white color code
      expect(lines[1]).toContain('\x1b[37m'); // White color
    });
  });

  describe('formatting', () => {
    it('should format POI types correctly', () => {
      const pois: POIEntry[] = [
        {
          id: 'OB_1',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 0.5,
          confidence: 80,
          age: 1,
          mitigated: false,
          strength: 85
        },
        {
          id: 'FVG_1',
          type: 'FVG',
          direction: 'BEARISH',
          price: 49500,
          distance: -0.8,
          confidence: 75,
          age: 1,
          mitigated: false,
          strength: 80
        },
        {
          id: 'LIQ_1',
          type: 'LIQUIDITY_POOL',
          direction: 'BULLISH',
          price: 50200,
          distance: 1.2,
          confidence: 90,
          age: 0.5,
          mitigated: false,
          strength: 95,
          volume: 1000000
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      expect(lines[1]).toContain('OB-BULL');
      expect(lines[2]).toContain('FVG-BEAR');
      expect(lines[3]).toContain('LIQ-BULL');
    });

    it('should format prices correctly', () => {
      const pois: POIEntry[] = [
        {
          id: 'HIGH_PRICE',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000, // Should show as 50,000
          distance: 0.5,
          confidence: 80,
          age: 1,
          mitigated: false,
          strength: 85
        },
        {
          id: 'LOW_PRICE',
          type: 'FVG',
          direction: 'BEARISH',
          price: 1.2345, // Should show as 1.23
          distance: -0.8,
          confidence: 75,
          age: 1,
          mitigated: false,
          strength: 80
        },
        {
          id: 'VERY_LOW_PRICE',
          type: 'LIQUIDITY_POOL',
          direction: 'BULLISH',
          price: 0.001234, // Should show as 0.0012
          distance: 1.2,
          confidence: 90,
          age: 0.5,
          mitigated: false,
          strength: 95
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      expect(lines[1]).toContain('50,000');
      expect(lines[2]).toContain('1.23');
      expect(lines[3]).toContain('0.0012');
    });

    it('should format distances with correct signs', () => {
      const pois: POIEntry[] = [
        {
          id: 'POSITIVE_DIST',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 1.5,
          confidence: 80,
          age: 1,
          mitigated: false,
          strength: 85
        },
        {
          id: 'NEGATIVE_DIST',
          type: 'FVG',
          direction: 'BEARISH',
          price: 49500,
          distance: -2.3,
          confidence: 75,
          age: 1,
          mitigated: false,
          strength: 80
        }
      ];

      component.updateConfig({ pois });
      const lines = component.render();

      expect(lines[1]).toContain('+1.5%');
      expect(lines[2]).toContain('-2.3%');
    });
  });

  describe('updateConfig', () => {
    it('should update POI list correctly', () => {
      const initialPOIs: POIEntry[] = [
        {
          id: 'POI_1',
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          price: 50000,
          distance: 1.0,
          confidence: 80,
          age: 1,
          mitigated: false,
          strength: 85
        }
      ];

      component.updateConfig({ pois: initialPOIs });
      let lines = component.render();
      expect(lines[1]).toContain('OB-BULL');

      const updatedPOIs: POIEntry[] = [
        {
          id: 'POI_2',
          type: 'FVG',
          direction: 'BEARISH',
          price: 49500,
          distance: -0.5,
          confidence: 90,
          age: 0.5,
          mitigated: false,
          strength: 95
        }
      ];

      component.updateConfig({ pois: updatedPOIs });
      lines = component.render();
      expect(lines[1]).toContain('FVG-BEAR');
      expect(lines[1]).not.toContain('OB-BULL');
    });
  });
});