import { createWorkflow, Step } from '@mastra/core';
import { emailTool } from '../tools/emailTool';
import { z } from 'zod';

// Task storage interface for workflow integration
interface WorkflowExecutionLog {
  timestamp: Date;
  emailsChecked: number;
  tasksExtracted: number;
  status: 'success' | 'error';
  error?: string;
}

// In-memory execution log (replace with database in production)
const executionLogs: WorkflowExecutionLog[] = [];

// Helper function to log workflow execution
function logExecution(log: WorkflowExecutionLog): void {
  executionLogs.push(log);
  console.log(`[Task Refresh Workflow] ${log.timestamp.toISOString()}`);
  console.log(`  Status: ${log.status}`);
  console.log(`  Emails Checked: ${log.emailsChecked}`);
  console.log(`  Tasks Extracted: ${log.tasksExtracted}`);
  if (log.error) {
    console.error(`  Error: ${log.error}`);
  }
}

// Step 1: Fetch new emails from Gmail
const fetchEmailsStep: Step = {
  id: 'fetch-emails',
  description: 'Fetch unread emails from Gmail inbox',
  execute: async ({ toolbox }) => {
    console.log('[Step 1] Fetching new emails from Gmail...');
    
    try {
      const result = await emailTool.execute({
        context: {},
        input: {
          action: 'getEmails',
          maxResults: 20, // Check up to 20 unread emails
        },
      });

      if (result.success) {
        console.log(`[Step 1] Successfully fetched ${result.emails.length} emails`);
        return {
          emails: result.emails,
          emailCount: result.emails.length,
        };
      } else {
        throw new Error('Failed to fetch emails');
      }
    } catch (error) {
      console.error('[Step 1] Error fetching emails:', error);
      throw error;
    }
  },
};

// Step 2: Extract tasks from fetched emails
const extractTasksStep: Step = {
  id: 'extract-tasks',
  description: 'Extract actionable tasks from emails using AI',
  execute: async ({ context, toolbox }) => {
    const { emailCount } = context;
    console.log(`[Step 2] Extracting tasks from ${emailCount} emails...`);
    
    try {
      const result = await emailTool.execute({
        context: {},
        input: {
          action: 'extractTasks',
          maxResults: 20,
        },
      });

      if (result.success) {
        console.log(`[Step 2] Successfully extracted ${result.tasks.length} tasks`);
        return {
          tasks: result.tasks,
          taskCount: result.tasks.length,
        };
      } else {
        throw new Error('Failed to extract tasks');
      }
    } catch (error) {
      console.error('[Step 2] Error extracting tasks:', error);
      throw error;
    }
  },
};

// Step 3: Update task list and log execution
const updateTaskListStep: Step = {
  id: 'update-task-list',
  description: 'Update the agent\'s to-do list storage and log execution status',
  execute: async ({ context }) => {
    const { emailCount, taskCount, tasks } = context;
    console.log(`[Step 3] Updating task list with ${taskCount} new tasks...`);
    
    try {
      // Get current task list to verify update
      const listResult = await emailTool.execute({
        context: {},
        input: {
          action: 'listTasks',
        },
      });

      if (listResult.success) {
        const totalTasks = listResult.tasks.length;
        console.log(`[Step 3] Task list updated. Total tasks in storage: ${totalTasks}`);
        
        // Log successful execution
        logExecution({
          timestamp: new Date(),
          emailsChecked: emailCount || 0,
          tasksExtracted: taskCount || 0,
          status: 'success',
        });

        return {
          success: true,
          totalTasks,
          newTasks: taskCount,
          message: `Task refresh completed successfully. Extracted ${taskCount} tasks from ${emailCount} emails.`,
        };
      } else {
        throw new Error('Failed to verify task list update');
      }
    } catch (error) {
      console.error('[Step 3] Error updating task list:', error);
      
      // Log failed execution
      logExecution({
        timestamp: new Date(),
        emailsChecked: emailCount || 0,
        tasksExtracted: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  },
};

// Create the task refresh workflow
export const taskRefreshWorkflow = createWorkflow({
  name: 'task-refresh-workflow',
  triggerSchema: z.object({
    manualTrigger: z.boolean().optional().default(false),
  }),
})
  .step(fetchEmailsStep)
  .step(extractTasksStep)
  .step(updateTaskListStep)
  .commit();

// Workflow trigger configuration for hourly execution
export const workflowConfig = {
  // Run every hour (cron format: minute hour day month weekday)
  schedule: '0 * * * *', // At minute 0 of every hour
  enabled: true,
  workflow: taskRefreshWorkflow,
};

// Export helper function to get execution logs
export function getExecutionLogs(): WorkflowExecutionLog[] {
  return executionLogs;
}

// Export helper function to manually trigger the workflow
export async function triggerTaskRefresh() {
  console.log('[Manual Trigger] Starting task refresh workflow...');
  
  try {
    const result = await taskRefreshWorkflow.execute({
      triggerData: { manualTrigger: true },
    });
    
    console.log('[Manual Trigger] Workflow completed successfully');
    return result;
  } catch (error) {
    console.error('[Manual Trigger] Workflow execution failed:', error);
    throw error;
  }
}
