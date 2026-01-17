/**
 * Hunter Application - Main React Component
 * Manages the state between HunterHUD and ConfigPanel modal overlay
 *
 * Requirements: 18.1 (Display configuration panel overlay when user presses F1 key)
 */

import React, { useState, useEffect } from 'react';
import { Box, render } from 'ink';
import { ConfigManager, Phase2Config } from '../config/ConfigManager';
import ConfigPanel from './ConfigPanel';

/**
 * Application state
 */
interface AppState {
  showConfigPanel: boolean;
  config: Phase2Config;
}

/**
 * Hunter Application Component
 * Manages the modal overlay for configuration panel
 */
export function HunterApp() {
  const [appState, setAppState] = useState<AppState>({
    showConfigPanel: false,
    config: new ConfigManager().getConfig(),
  });

  const [configManager] = useState(() => new ConfigManager());

  /**
   * Handle F1 key press to show config panel
   */
  const handleShowConfig = () => {
    setAppState(prev => ({
      ...prev,
      showConfigPanel: true,
      config: configManager.getConfig(), // Reload latest config
    }));
  };

  /**
   * Handle config save
   * Requirement 18.6: Write configuration to config.json file and apply changes immediately
   */
  const handleConfigSave = (newConfig: Phase2Config) => {
    try {
      configManager.saveConfig(newConfig);
      setAppState(prev => ({
        ...prev,
        showConfigPanel: false,
        config: newConfig,
      }));
      console.log('✅ Configuration saved successfully');
    } catch (error) {
      console.error('❌ Failed to save configuration:', error);
    }
  };

  /**
   * Handle config cancel
   * Requirement 18.7: Discard changes and return to dashboard
   */
  const handleConfigCancel = () => {
    setAppState(prev => ({
      ...prev,
      showConfigPanel: false,
    }));
  };

  /**
   * Handle application exit
   */
  const handleExit = () => {
    configManager.destroy();
    process.exit(0);
  };

  // Setup config manager
  useEffect(() => {
    configManager.startWatching();

    // Listen for config changes
    configManager.on('configChanged', () => {
      setAppState(prev => ({
        ...prev,
        config: configManager.getConfig(),
      }));
    });

    return () => {
      configManager.stopWatching();
      configManager.destroy();
    };
  }, [configManager]);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Conditional rendering: either show HUD or Config Panel */}
      {appState.showConfigPanel ? (
        <ConfigPanel
          config={appState.config}
          onSave={handleConfigSave}
          onCancel={handleConfigCancel}
        />
      ) : (
        <HunterHUDDisplay
          onConfig={handleShowConfig}
          onExit={handleExit}
          config={appState.config}
        />
      )}
    </Box>
  );
}

/**
 * HUD Display Component (Non-React wrapper for HunterHUD)
 * This component bridges the React world with the non-React HunterHUD
 */
function HunterHUDDisplay({
  onConfig,
  onExit,
  config,
}: {
  onConfig: () => void;
  onExit: () => void;
  config: Phase2Config;
}) {
  useEffect(() => {
    // Since HunterHUD is not a React component, we need to handle it differently
    // For now, we'll display a placeholder that shows the config is working
    console.clear();
    console.log('🎯 Titan Phase 2 - The Hunter (React Mode)');
    console.log('📊 Holographic Market Structure Engine');
    console.log('');
    console.log('Current Configuration:');
    console.log(
      `📊 Alignment: Daily ${config.alignmentWeights.daily}%, 4H ${config.alignmentWeights.h4}%, 15m ${config.alignmentWeights.m15}%`
    );
    console.log(
      `📈 RS: Threshold ${config.rsConfig.threshold}%, Lookback ${config.rsConfig.lookbackPeriod}h`
    );
    console.log(
      `⚡ Risk: Leverage ${config.riskConfig.maxLeverage}x, Stop ${config.riskConfig.stopLossPercent}%, Target ${config.riskConfig.targetPercent}%`
    );
    console.log(
      `💼 Portfolio: Max ${config.portfolioConfig.maxConcurrentPositions} positions, Heat ${config.portfolioConfig.maxPortfolioHeat}%, Correlation ${config.portfolioConfig.correlationThreshold}`
    );
    console.log('');
    console.log('[F1] CONFIG  [Q] QUIT');

    // Setup keyboard handling
    const handleKeyPress = (key: string) => {
      if (key === '\u0003' || key === 'q') {
        // Ctrl+C or 'q'
        onExit();
      } else if (key === '\u001b[11~') {
        // F1
        onConfig();
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', handleKeyPress);

    return () => {
      process.stdin.removeListener('data', handleKeyPress);
    };
  }, [config, onConfig, onExit]);

  return (
    <Box flexDirection="column">
      {/* This is a placeholder - the actual HUD rendering happens in the useEffect above */}
    </Box>
  );
}

/**
 * Start the Hunter Application with React/Ink
 */
export function startHunterApp(): void {
  render(<HunterApp />);
}

export default HunterApp;
