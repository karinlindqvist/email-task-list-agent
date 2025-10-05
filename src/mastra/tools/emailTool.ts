import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createTool } from '@mastra/core';
import { z } from 'zod';

// Gmail OAuth2 Configuration
const oauth2Client = new OAuth2Client(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// Set credentials if refresh token is available
if (process.env.GMAIL_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// In-memory task storage (replace with database in production)
interface Task {
  id: string;
  emailId: string;
  subject: string;
  description: string;
  sender: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  status: 'pending' | 'completed';
  notes: string[];
  createdAt: Date;
}

const taskStore: Map<string, Task> = new Map();

// Helper function to decode email body
function decodeEmailBody(body: any): string {
  if (!body) return '';
  
  if (body.data) {
    return Buffer.from(body.data, 'base64').toString('utf-8');
  }
  
  if (body.parts) {
    for (const part of body.parts) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        return decodeEmailBody(part.body);
      }
      if (part.parts) {
        const decoded = decodeEmailBody({ parts: part.parts });
        if (decoded) return decoded;
      }
    }
  }
  
  return '';
}

// Helper function to check if email is promotional/automated
function isPromotionalEmail(headers: any[], body: string): boolean {
  const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
  
  const promotionalKeywords = [
    'unsubscribe', 'newsletter', 'promotion', 'sale', 'discount',
    'offer', 'deal', 'no-reply', 'noreply', 'automated'
  ];
  
  const contentToCheck = (fromHeader + subjectHeader + body).toLowerCase();
  
  return promotionalKeywords.some(keyword => contentToCheck.includes(keyword));
}

// Get emails from Gmail inbox
async function getEmails(maxResults: number = 10): Promise<any[]> {
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox is:unread', // Only fetch unread emails from inbox
    });

    const messages = response.data.messages || [];
    const emailDetails = [];

    for (const message of messages) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const body = decodeEmailBody(detail.data.payload?.body || detail.data.payload);

      // Skip promotional emails
      if (isPromotionalEmail(headers, body)) {
        continue;
      }

      emailDetails.push({
        id: message.id,
        subject,
        from,
        date,
        body: body.substring(0, 2000), // Limit body length
      });
    }

    return emailDetails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw new Error('Failed to fetch emails from Gmail');
  }
}

// Extract tasks from email using OpenAI
async function extractTasksFromEmail(email: any): Promise<Task | null> {
  try {
    const prompt = `
Analyze the following email and extract any actionable tasks.
If there are no clear action items, return null.

Email Subject: ${email.subject}
From: ${email.from}
Date: ${email.date}
Body:
${email.body}

Extract:
1. Task description (clear, concise action item)
2. Priority (high/medium/low based on urgency indicators)
3. Due date (if mentioned, in ISO format)
4. Any relevant context

Return as JSON with fields: description, priority, dueDate (optional), context.
If no actionable task exists, return {"noTask": true}.
`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt,
    });

    const result = JSON.parse(text);
    
    if (result.noTask) {
      return null;
    }

    const task: Task = {
      id: `task-${email.id}-${Date.now()}`,
      emailId: email.id,
      subject: email.subject,
      description: result.description,
      sender: email.from,
      priority: result.priority || 'medium',
      dueDate: result.dueDate,
      status: 'pending',
      notes: [result.context || ''],
      createdAt: new Date(),
    };

    taskStore.set(task.id, task);
    return task;
  } catch (error) {
    console.error('Error extracting task from email:', error);
    return null;
  }
}

// Mark task as complete
function markTaskComplete(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (task) {
    task.status = 'completed';
    taskStore.set(taskId, task);
    return true;
  }
  return false;
}

// Add note to task
function addTaskNote(taskId: string, note: string): boolean {
  const task = taskStore.get(taskId);
  if (task) {
    task.notes.push(note);
    taskStore.set(taskId, task);
    return true;
  }
  return false;
}

// Get all tasks
function getAllTasks(): Task[] {
  return Array.from(taskStore.values());
}

// Export the emailTool for use in the agent
export const emailTool = createTool({
  id: 'email-tool',
  description: 'Access Gmail inbox, extract actionable tasks from emails, and manage task status',
  inputSchema: z.object({
    action: z.enum(['getEmails', 'extractTasks', 'markComplete', 'addNote', 'listTasks']),
    maxResults: z.number().optional().default(10),
    taskId: z.string().optional(),
    note: z.string().optional(),
  }),
  execute: async ({ context, input }) => {
    const { action, maxResults, taskId, note } = input;

    switch (action) {
      case 'getEmails': {
        const emails = await getEmails(maxResults);
        return {
          success: true,
          emails,
          message: `Retrieved ${emails.length} emails from inbox`,
        };
      }

      case 'extractTasks': {
        const emails = await getEmails(maxResults);
        const tasks = [];
        
        for (const email of emails) {
          const task = await extractTasksFromEmail(email);
          if (task) {
            tasks.push(task);
          }
        }

        return {
          success: true,
          tasks,
          message: `Extracted ${tasks.length} tasks from ${emails.length} emails`,
        };
      }

      case 'markComplete': {
        if (!taskId) {
          return { success: false, message: 'Task ID is required' };
        }
        
        const success = markTaskComplete(taskId);
        return {
          success,
          message: success ? 'Task marked as complete' : 'Task not found',
        };
      }

      case 'addNote': {
        if (!taskId || !note) {
          return { success: false, message: 'Task ID and note are required' };
        }
        
        const success = addTaskNote(taskId, note);
        return {
          success,
          message: success ? 'Note added to task' : 'Task not found',
        };
      }

      case 'listTasks': {
        const tasks = getAllTasks();
        return {
          success: true,
          tasks,
          message: `Found ${tasks.length} tasks`,
        };
      }

      default:
        return { success: false, message: 'Invalid action' };
    }
  },
});

// Export helper functions for external use
export {
  getEmails,
  extractTasksFromEmail,
  markTaskComplete,
  addTaskNote,
  getAllTasks,
};
