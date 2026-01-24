/**
 * ConfigPanel Component - F1 Key Modal Overlay
 * Institutional-grade configuration interface for Titan Phase 2 - The Hunter
 *
 * Requirements: 18.1-18.8 (Runtime Configuration)
 * - Modal overlay with alignment weight sliders (Daily 30-60%, 4H 20-40%, 15m 10-30%)
 * - RS threshold slider (0-5%)
 * - Risk settings (max leverage 3-5x, stop 1-3%, target 3-6%)
 * - Portfolio settings (max positions 3-8, max heat 10-20%, correlation 0.6-0.9)
 * - Save/cancel buttons with immediate application
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  Phase2Config,
  AlignmentWeights,
  RSConfig,
  RiskConfig,
  PortfolioConfig,
} from '../config/ConfigManager';

/**
 * ConfigPanel props
 */
export interface ConfigPanelProps {
  config: Phase2Config;
  onSave: (newConfig: Phase2Config) => void;
  onCancel: () => void;
}

/**
 * Active section type for navigation
 */
type ActiveSection = 'alignment' | 'rs' | 'risk' | 'portfolio';

/**
 * Slider configuration for different parameter types
 */
interface SliderConfig {
  min: number;
  max: number;
  step: number;
  unit: string;
  description: string;
}

/**
 * ConfigPanel Component
 *
 * Requirement 18.1: Display configuration panel overlay when user presses F1 key
 * Requirement 18.2: Allow adjustment of Daily weight (30-60%), 4H weight (20-40%), 15m weight (10-30%)
 * Requirement 18.3: Allow adjustment of RS threshold (0-5%) and lookback period (2-8 hours)
 * Requirement 18.4: Allow adjustment of max leverage (3-5x), stop loss (1-3%), target (3-6%)
 * Requirement 18.5: Allow adjustment of max positions (3-8), max heat (10-20%), correlation (0.6-0.9)
 * Requirement 18.6: Write configuration to config.json file and apply changes immediately
 * Requirement 18.7: Discard changes and return to dashboard when user cancels
 */
export function ConfigPanel({ config, onSave, onCancel }: ConfigPanelProps) {
  // Local state for editing
  const [editedConfig, setEditedConfig] = useState<Phase2Config>({ ...config });
  const [activeSection, setActiveSection] = useState<ActiveSection>('alignment');
  const [selectedParam, setSelectedParam] = useState<string>('daily');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  /**
   * Slider configurations for different parameters
   */
  const sliderConfigs: Record<string, SliderConfig> = {
    // Alignment weights
    daily: {
      min: 30,
      max: 60,
      step: 1,
      unit: '%',
      description: 'Daily timeframe weight (trend direction)',
    },
    h4: {
      min: 20,
      max: 40,
      step: 1,
      unit: '%',
      description: '4H timeframe weight (structure location)',
    },
    m15: {
      min: 10,
      max: 30,
      step: 1,
      unit: '%',
      description: '15m timeframe weight (trigger quality)',
    },

    // RS configuration
    rsThreshold: {
      min: 0,
      max: 5,
      step: 0.1,
      unit: '%',
      description: 'Relative strength threshold vs BTC',
    },
    rsLookback: {
      min: 2,
      max: 8,
      step: 0.5,
      unit: 'h',
      description: 'RS calculation lookback period',
    },

    // Risk configuration
    maxLeverage: {
      min: 3,
      max: 5,
      step: 0.1,
      unit: 'x',
      description: 'Maximum leverage per position',
    },
    stopLoss: {
      min: 1,
      max: 3,
      step: 0.1,
      unit: '%',
      description: 'Stop loss distance from entry',
    },
    target: { min: 3, max: 6, step: 0.1, unit: '%', description: 'Take profit target distance' },

    // Portfolio configuration
    maxPositions: {
      min: 3,
      max: 8,
      step: 1,
      unit: '',
      description: 'Maximum concurrent positions',
    },
    maxHeat: {
      min: 10,
      max: 20,
      step: 0.5,
      unit: '%',
      description: 'Maximum portfolio heat (total risk)',
    },
    correlation: {
      min: 0.6,
      max: 0.9,
      step: 0.01,
      unit: '',
      description: 'Maximum correlation between positions',
    },
  };

  /**
   * Handle keyboard input for navigation and value adjustment
   */
  useInput((input, key) => {
    if (key.escape || input === 'c') {
      handleCancel();
    } else if (input === 's') {
      handleSave();
    } else if (input >= '1' && input <= '4') {
      const sections: ActiveSection[] = ['alignment', 'rs', 'risk', 'portfolio'];
      setActiveSection(sections[parseInt(input) - 1]);
      // Set default selected parameter for each section
      const defaultParams = {
        alignment: 'daily',
        rs: 'rsThreshold',
        risk: 'maxLeverage',
        portfolio: 'maxPositions',
      };
      setSelectedParam(defaultParams[sections[parseInt(input) - 1]]);
    } else if (key.upArrow || key.downArrow) {
      // Navigate between parameters in current section
      const sectionParams = getSectionParams(activeSection);
      const currentIndex = sectionParams.indexOf(selectedParam);
      if (key.upArrow && currentIndex > 0) {
        setSelectedParam(sectionParams[currentIndex - 1]);
      } else if (key.downArrow && currentIndex < sectionParams.length - 1) {
        setSelectedParam(sectionParams[currentIndex + 1]);
      }
    } else if (key.leftArrow || key.rightArrow) {
      // Adjust parameter value
      const config = sliderConfigs[selectedParam];
      if (config) {
        const currentValue = getParameterValue(selectedParam);
        const delta = key.leftArrow ? -config.step : config.step;
        const newValue = Math.max(config.min, Math.min(config.max, currentValue + delta));
        updateParameterValue(selectedParam, newValue);
      }
    }
  });

  /**
   * Get parameters for a specific section
   */
  const getSectionParams = (section: ActiveSection): string[] => {
    switch (section) {
      case 'alignment':
        return ['daily', 'h4', 'm15'];
      case 'rs':
        return ['rsThreshold', 'rsLookback'];
      case 'risk':
        return ['maxLeverage', 'stopLoss', 'target'];
      case 'portfolio':
        return ['maxPositions', 'maxHeat', 'correlation'];
      default:
        return [];
    }
  };

  /**
   * Get current value for a parameter
   */
  const getParameterValue = (param: string): number => {
    switch (param) {
      case 'daily':
        return editedConfig.alignmentWeights.daily;
      case 'h4':
        return editedConfig.alignmentWeights.h4;
      case 'm15':
        return editedConfig.alignmentWeights.m15;
      case 'rsThreshold':
        return editedConfig.rsConfig.threshold;
      case 'rsLookback':
        return editedConfig.rsConfig.lookbackPeriod;
      case 'maxLeverage':
        return editedConfig.riskConfig.maxLeverage;
      case 'stopLoss':
        return editedConfig.riskConfig.stopLossPercent;
      case 'target':
        return editedConfig.riskConfig.targetPercent;
      case 'maxPositions':
        return editedConfig.portfolioConfig.maxConcurrentPositions;
      case 'maxHeat':
        return editedConfig.portfolioConfig.maxPortfolioHeat;
      case 'correlation':
        return editedConfig.portfolioConfig.correlationThreshold;
      default:
        return 0;
    }
  };

  /**
   * Update parameter value with validation
   */
  const updateParameterValue = (param: string, value: number) => {
    const newConfig = { ...editedConfig };

    switch (param) {
      case 'daily':
        // eslint-disable-next-line functional/immutable-data
        newConfig.alignmentWeights = { ...newConfig.alignmentWeights, daily: value };
        break;
      case 'h4':
        // eslint-disable-next-line functional/immutable-data
        newConfig.alignmentWeights = { ...newConfig.alignmentWeights, h4: value };
        break;
      case 'm15':
        // eslint-disable-next-line functional/immutable-data
        newConfig.alignmentWeights = { ...newConfig.alignmentWeights, m15: value };
        break;
      case 'rsThreshold':
        // eslint-disable-next-line functional/immutable-data
        newConfig.rsConfig = { ...newConfig.rsConfig, threshold: value };
        break;
      case 'rsLookback':
        // eslint-disable-next-line functional/immutable-data
        newConfig.rsConfig = { ...newConfig.rsConfig, lookbackPeriod: value };
        break;
      case 'maxLeverage':
        // eslint-disable-next-line functional/immutable-data
        newConfig.riskConfig = { ...newConfig.riskConfig, maxLeverage: value };
        break;
      case 'stopLoss':
        // eslint-disable-next-line functional/immutable-data
        newConfig.riskConfig = { ...newConfig.riskConfig, stopLossPercent: value };
        break;
      case 'target':
        // eslint-disable-next-line functional/immutable-data
        newConfig.riskConfig = { ...newConfig.riskConfig, targetPercent: value };
        break;
      case 'maxPositions':
        // eslint-disable-next-line functional/immutable-data
        newConfig.portfolioConfig = {
          ...newConfig.portfolioConfig,
          maxConcurrentPositions: Math.round(value),
        };
        break;
      case 'maxHeat':
        // eslint-disable-next-line functional/immutable-data
        newConfig.portfolioConfig = { ...newConfig.portfolioConfig, maxPortfolioHeat: value };
        break;
      case 'correlation':
        // eslint-disable-next-line functional/immutable-data
        newConfig.portfolioConfig = { ...newConfig.portfolioConfig, correlationThreshold: value };
        break;
    }

    setEditedConfig(newConfig);
    validateConfig(newConfig);
  };

  /**
   * Validate configuration and update errors
   */
  const validateConfig = (config: Phase2Config) => {
    const errors: string[] = [];

    // Validate alignment weights sum to 100%
    const total =
      config.alignmentWeights.daily + config.alignmentWeights.h4 + config.alignmentWeights.m15;
    if (Math.abs(total - 100) > 0.1) {
      // eslint-disable-next-line functional/immutable-data
      errors.push(`Alignment weights must sum to 100% (currently ${total.toFixed(1)}%)`);
    }

    // Validate R:R ratio
    const rrRatio = config.riskConfig.targetPercent / config.riskConfig.stopLossPercent;
    if (rrRatio < 2.0) {
      // eslint-disable-next-line functional/immutable-data
      errors.push(`R:R ratio too low (${rrRatio.toFixed(1)}:1, minimum 2:1 recommended)`);
    }

    setValidationErrors(errors);
  };

  /**
   * Handle save with validation
   * Requirement 18.6: Write configuration to config.json file and apply changes immediately
   */
  const handleSave = () => {
    if (validationErrors.length === 0) {
      onSave(editedConfig);
    }
  };

  /**
   * Handle cancel
   * Requirement 18.7: Discard changes and return to dashboard
   */
  const handleCancel = () => {
    onCancel();
  };

  /**
   * Auto-adjust alignment weights to sum to 100%
   */
  const autoAdjustWeights = () => {
    const weights = editedConfig.alignmentWeights;
    const total = weights.daily + weights.h4 + weights.m15;

    if (Math.abs(total - 100) > 0.1) {
      // Proportionally adjust to sum to 100%
      const factor = 100 / total;
      const newWeights = {
        daily: Math.round(weights.daily * factor),
        h4: Math.round(weights.h4 * factor),
        m15: Math.round(weights.m15 * factor),
      };

      // Ensure exact sum of 100% by adjusting the largest weight
      const newTotal = newWeights.daily + newWeights.h4 + newWeights.m15;
      if (newTotal !== 100) {
        const largest = Math.max(newWeights.daily, newWeights.h4, newWeights.m15);
        // eslint-disable-next-line functional/immutable-data
        if (newWeights.daily === largest) newWeights.daily += 100 - newTotal;
        // eslint-disable-next-line functional/immutable-data
        else if (newWeights.h4 === largest) newWeights.h4 += 100 - newTotal;
        // eslint-disable-next-line functional/immutable-data
        else newWeights.m15 += 100 - newTotal;
      }

      setEditedConfig(prev => ({
        ...prev,
        alignmentWeights: newWeights,
      }));
      validateConfig({ ...editedConfig, alignmentWeights: newWeights });
    }
  };

  // Validate on mount and config changes
  useEffect(() => {
    validateConfig(editedConfig);
  }, [editedConfig]);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      width={100}
      height={25}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ⚙️ PHASE 2 HUNTER - CONFIGURATION PANEL
        </Text>
      </Box>

      {/* Section Tabs */}
      <Box marginBottom={1}>
        <Text color={activeSection === 'alignment' ? 'cyan' : 'gray'}>[1] Alignment Weights</Text>
        <Text> </Text>
        <Text color={activeSection === 'rs' ? 'cyan' : 'gray'}>[2] Relative Strength</Text>
        <Text> </Text>
        <Text color={activeSection === 'risk' ? 'cyan' : 'gray'}>[3] Risk Management</Text>
        <Text> </Text>
        <Text color={activeSection === 'portfolio' ? 'cyan' : 'gray'}>[4] Portfolio</Text>
      </Box>

      {/* Content Area */}
      <Box flexDirection="column" marginBottom={1} borderStyle="single" padding={1} height={15}>
        {activeSection === 'alignment' && (
          <AlignmentWeightsSection
            config={editedConfig}
            selectedParam={selectedParam}
            sliderConfigs={sliderConfigs}
            onAutoAdjust={autoAdjustWeights}
          />
        )}

        {activeSection === 'rs' && (
          <RSConfigSection
            config={editedConfig}
            selectedParam={selectedParam}
            sliderConfigs={sliderConfigs}
          />
        )}

        {activeSection === 'risk' && (
          <RiskConfigSection
            config={editedConfig}
            selectedParam={selectedParam}
            sliderConfigs={sliderConfigs}
          />
        )}

        {activeSection === 'portfolio' && (
          <PortfolioConfigSection
            config={editedConfig}
            selectedParam={selectedParam}
            sliderConfigs={sliderConfigs}
          />
        )}
      </Box>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>
            ⚠️ Validation Errors:
          </Text>
          {validationErrors.map((error, index) => (
            <Text key={index} color="red">
              {' '}
              • {error}
            </Text>
          ))}
        </Box>
      )}

      {/* Action Buttons */}
      <Box marginTop={1}>
        <Text dimColor>[S] Save [C] Cancel [1-4] Switch Section [↑↓] Navigate [←→] Adjust</Text>
      </Box>

      {/* Save Button Status */}
      <Box>
        <Text color={validationErrors.length === 0 ? 'green' : 'red'}>
          {validationErrors.length === 0 ? '✓ Ready to Save' : '✗ Fix errors before saving'}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Alignment Weights Section
 * Requirement 18.2: Allow adjustment of Daily weight (30-60%), 4H weight (20-40%), 15m weight (10-30%)
 */
function AlignmentWeightsSection({
  config,
  selectedParam,
  sliderConfigs,
  onAutoAdjust,
}: {
  config: Phase2Config;
  selectedParam: string;
  sliderConfigs: Record<string, SliderConfig>;
  onAutoAdjust: () => void;
}) {
  const weights = config.alignmentWeights;
  const total = weights.daily + weights.h4 + weights.m15;

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        📊 Alignment Weights (Multi-Timeframe Scoring)
      </Text>

      <Box marginTop={1}>
        <Text dimColor>
          Weights determine how much each timeframe contributes to alignment score.
        </Text>
      </Box>

      <SliderRow
        label="Daily Bias"
        value={weights.daily}
        config={sliderConfigs.daily}
        selected={selectedParam === 'daily'}
      />

      <SliderRow
        label="4H Structure"
        value={weights.h4}
        config={sliderConfigs.h4}
        selected={selectedParam === 'h4'}
      />

      <SliderRow
        label="15m Trigger"
        value={weights.m15}
        config={sliderConfigs.m15}
        selected={selectedParam === 'm15'}
      />

      <Box marginTop={1}>
        <Text>Total: </Text>
        <Text color={Math.abs(total - 100) < 0.1 ? 'green' : 'red'}>{total.toFixed(1)}%</Text>
        <Text dimColor> (must equal 100%)</Text>
        {Math.abs(total - 100) > 0.1 && <Text color="yellow"> [A] Auto-adjust</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Higher weights = more influence on final alignment score</Text>
      </Box>
    </Box>
  );
}

/**
 * Relative Strength Configuration Section
 * Requirement 18.3: Allow adjustment of RS threshold (0-5%) and lookback period (2-8 hours)
 */
function RSConfigSection({
  config,
  selectedParam,
  sliderConfigs,
}: {
  config: Phase2Config;
  selectedParam: string;
  sliderConfigs: Record<string, SliderConfig>;
}) {
  const rsConfig = config.rsConfig;

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        📈 Relative Strength vs BTC
      </Text>

      <Box marginTop={1}>
        <Text dimColor>RS filters ensure we trade the strongest/weakest assets vs BTC.</Text>
      </Box>

      <SliderRow
        label="RS Threshold"
        value={rsConfig.threshold}
        config={sliderConfigs.rsThreshold}
        selected={selectedParam === 'rsThreshold'}
      />

      <SliderRow
        label="Lookback Period"
        value={rsConfig.lookbackPeriod}
        config={sliderConfigs.rsLookback}
        selected={selectedParam === 'rsLookback'}
      />

      <Box marginTop={1}>
        <Text dimColor>
          • Long signals require RS {'>'} +{rsConfig.threshold}% (stronger than BTC)
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          • Short signals require RS {'<'} -{rsConfig.threshold}% (weaker than BTC)
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Higher threshold = more selective (fewer but stronger signals)</Text>
      </Box>
    </Box>
  );
}

/**
 * Risk Management Configuration Section
 * Requirement 18.4: Allow adjustment of max leverage (3-5x), stop loss (1-3%), target (3-6%)
 */
function RiskConfigSection({
  config,
  selectedParam,
  sliderConfigs,
}: {
  config: Phase2Config;
  selectedParam: string;
  sliderConfigs: Record<string, SliderConfig>;
}) {
  const riskConfig = config.riskConfig;
  const rrRatio = riskConfig.targetPercent / riskConfig.stopLossPercent;

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        🛡️ Risk Management
      </Text>

      <Box marginTop={1}>
        <Text dimColor>Conservative risk parameters for institutional-grade trading.</Text>
      </Box>

      <SliderRow
        label="Max Leverage"
        value={riskConfig.maxLeverage}
        config={sliderConfigs.maxLeverage}
        selected={selectedParam === 'maxLeverage'}
      />

      <SliderRow
        label="Stop Loss"
        value={riskConfig.stopLossPercent}
        config={sliderConfigs.stopLoss}
        selected={selectedParam === 'stopLoss'}
      />

      <SliderRow
        label="Take Profit"
        value={riskConfig.targetPercent}
        config={sliderConfigs.target}
        selected={selectedParam === 'target'}
      />

      <Box marginTop={1}>
        <Text>Risk-Reward Ratio: </Text>
        <Text color={rrRatio >= 2.5 ? 'green' : rrRatio >= 2.0 ? 'yellow' : 'red'}>
          {rrRatio.toFixed(1)}:1
        </Text>
        <Text dimColor> (minimum 2:1 recommended)</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Lower leverage = safer but smaller absolute returns</Text>
      </Box>
    </Box>
  );
}

/**
 * Portfolio Management Configuration Section
 * Requirement 18.5: Allow adjustment of max positions (3-8), max heat (10-20%), correlation (0.6-0.9)
 */
function PortfolioConfigSection({
  config,
  selectedParam,
  sliderConfigs,
}: {
  config: Phase2Config;
  selectedParam: string;
  sliderConfigs: Record<string, SliderConfig>;
}) {
  const portfolioConfig = config.portfolioConfig;

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        💼 Portfolio Management
      </Text>

      <Box marginTop={1}>
        <Text dimColor>Multi-position risk management and correlation controls.</Text>
      </Box>

      <SliderRow
        label="Max Positions"
        value={portfolioConfig.maxConcurrentPositions}
        config={sliderConfigs.maxPositions}
        selected={selectedParam === 'maxPositions'}
      />

      <SliderRow
        label="Max Portfolio Heat"
        value={portfolioConfig.maxPortfolioHeat}
        config={sliderConfigs.maxHeat}
        selected={selectedParam === 'maxHeat'}
      />

      <SliderRow
        label="Correlation Limit"
        value={portfolioConfig.correlationThreshold}
        config={sliderConfigs.correlation}
        selected={selectedParam === 'correlation'}
      />

      <Box marginTop={1}>
        <Text dimColor>• Portfolio heat = sum of all position risks as % of equity</Text>
      </Box>
      <Box>
        <Text dimColor>• Correlation limit prevents overexposure to similar assets</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>More positions = better diversification but more complexity</Text>
      </Box>
    </Box>
  );
}

/**
 * Reusable Slider Row Component
 */
function SliderRow({
  label,
  value,
  config,
  selected,
}: {
  label: string;
  value: number;
  config: SliderConfig;
  selected: boolean;
}) {
  const percentage = ((value - config.min) / (config.max - config.min)) * 100;
  const barLength = 20;
  const filledLength = Math.round((percentage / 100) * barLength);

  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  return (
    <Box marginTop={1}>
      <Box width={15}>
        <Text color={selected ? 'cyan' : 'white'}>
          {selected ? '► ' : '  '}
          {label}:
        </Text>
      </Box>
      <Box width={25}>
        <Text color={selected ? 'cyan' : 'gray'}>[{bar}]</Text>
      </Box>
      <Box width={8}>
        <Text color={selected ? 'cyan' : 'white'}>
          {value.toFixed(config.step >= 1 ? 0 : config.step >= 0.1 ? 1 : 2)}
          {config.unit}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          ({config.min}-{config.max}
          {config.unit})
        </Text>
      </Box>
    </Box>
  );
}

export default ConfigPanel;
