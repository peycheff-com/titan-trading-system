#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { PlanCommand } from './commands/plan';
import { RunCommand } from './commands/run';
import { FixCommand } from './commands/fix';

const program = new Command();

program.name('quality-os').description('Titan Autonomous Quality OS CLI').version('0.1.0');

program
  .command('plan')
  .description('Analyze changes and generate a Quality Plan')
  .action(async () => {
    const cmd = new PlanCommand();
    await cmd.execute({ base: 'origin/main', head: 'HEAD' });
  });

program
  .command('run')
  .description('Execute the generated plan and produce EvidencePacks')
  .option('--plan <path>', 'Path to plan.json')
  .action((options) => {
    console.log(chalk.blue('⚙️ QualityKernel: Executing...'));
    new RunCommand().execute(options);
  });

program
  .command('fix')
  .description('Autonomously apply F0 fixes and verify')
  .option('--dry-run', 'Simulate fixes without applying', false)
  .action((options) => {
    console.log(chalk.blue('🔧 QualityKernel: Fixing...'));
    new FixCommand().execute(options);
  });

program.parse(process.argv);
