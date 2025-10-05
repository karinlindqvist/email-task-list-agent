# Email Task List Agent

An AI-powered agent that automatically extracts actionable tasks from your Gmail inbox and maintains an intelligent to-do list using the Mastra framework.

## Overview

The Email Task List Agent:
- Automatically monitors your Gmail inbox for unread emails
- Uses AI to extract actionable tasks from email content
- Maintains a centralized to-do list with task metadata
- Runs on an hourly schedule to keep your task list up-to-date
- Provides tools to view, complete, and manage tasks

## Prerequisites

Before setting up the Email Task List Agent, ensure you have:

1. **Node.js** (v18 or higher) and **pnpm** installed
2. **Gmail API Credentials** from Google Cloud Console
3. **OpenAI API Key** for AI-powered task extraction
4. **Mastra Cloud Account** for deployment (optional, for cloud deployment)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/karinlindqvist/email-task-list-agent.git
cd email-task-list-agent
pnpm install
```

### 2. Configure Gmail API Credentials

#### Step 2.1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Navigate to **APIs & Services** > **Library**
   - Search for "Gmail API"
   - Click **Enable**

#### Step 2.2: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Configure the OAuth consent screen if prompted:
   - User Type: External (for testing) or Internal (for organization use)
   - Add your email as a test user
   - Add scopes: `gmail.readonly` and `gmail.modify`
4. For Application type, select **Desktop app**
5. Download the credentials JSON file

#### Step 2.3: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and configure the following variables:

```env
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Gmail API Credentials (from downloaded JSON)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback

# Gmail OAuth Tokens (will be generated on first run)
GMAIL_REFRESH_TOKEN=
GMAIL_ACCESS_TOKEN=
```

3. Get your OpenAI API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

#### Step 2.4: Authorize the Application

On first run, the agent will prompt you to authorize access to your Gmail account:

1. Run the development server:
   ```bash
   pnpm dev
   ```

2. Follow the authorization URL that appears in the console
3. Grant the necessary permissions
4. The refresh token will be automatically saved to your `.env` file

## Local Development

### Running the Agent Locally

```bash
pnpm dev
```

This starts the Mastra development server with:
- Automatic workflow execution
- Interactive task management interface
- Real-time logs and monitoring

### Manual Workflow Trigger

To manually trigger the task refresh workflow:

```bash
pnpm mastra workflow:execute task-refresh-workflow
```

### Accessing the To-Do List

The agent provides several ways to interact with your task list:

1. **View all tasks**:
   ```bash
   pnpm mastra tool:execute emailTool --input '{"action":"listTasks"}'
   ```

2. **Mark a task as complete**:
   ```bash
   pnpm mastra tool:execute emailTool --input '{"action":"completeTask","taskId":"task_id_here"}'
   ```

3. **Get task details**:
   ```bash
   pnpm mastra tool:execute emailTool --input '{"action":"getTask","taskId":"task_id_here"}'
   ```

## Deployment to Mastra Cloud

### Prerequisites for Cloud Deployment

1. Create a Mastra Cloud account at [https://cloud.mastra.ai](https://cloud.mastra.ai)
2. Install the Mastra CLI:
   ```bash
   npm install -g @mastra/cli
   ```
3. Authenticate with Mastra Cloud:
   ```bash
   mastra login
   ```

### Deployment Steps

#### Step 1: Prepare for Deployment

1. Ensure all environment variables are set in `.env`
2. Test the workflow locally to verify everything works
3. Commit your changes to git

#### Step 2: Deploy to Mastra Cloud

```bash
# Initialize Mastra Cloud project (first time only)
mastra cloud:init

# Deploy the agent
mastra cloud:deploy
```

#### Step 3: Configure Cloud Environment Variables

1. Log in to [Mastra Cloud Dashboard](https://cloud.mastra.ai)
2. Navigate to your project
3. Go to **Settings** > **Environment Variables**
4. Add all required variables from your `.env` file:
   - `OPENAI_API_KEY`
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REDIRECT_URI` (update to cloud callback URL)
   - `GMAIL_REFRESH_TOKEN`

#### Step 4: Enable Scheduled Workflow

1. In the Mastra Cloud Dashboard, go to **Workflows**
2. Find `task-refresh-workflow`
3. Enable the schedule (runs hourly at minute 0)
4. Optionally adjust the schedule in `src/mastra/workflows/taskRefreshWorkflow.ts`:
   ```typescript
   schedule: '0 * * * *', // Current: Every hour
   // Examples:
   // '*/30 * * * *' // Every 30 minutes
   // '0 9-17 * * 1-5' // Every hour from 9 AM to 5 PM, Monday-Friday
   ```

#### Step 5: Monitor Execution

1. View workflow execution logs in the Mastra Cloud Dashboard
2. Check the **Logs** tab for detailed execution information
3. Monitor task extraction metrics and error rates

## Project Structure

```
email-task-list-agent/
├── src/
│   └── mastra/
│       ├── tools/
│       │   └── emailTool.ts       # Gmail integration and task management
│       └── workflows/
│           └── taskRefreshWorkflow.ts  # Hourly task refresh workflow
├── .env.example                    # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

The Email Task List Agent operates through a three-step workflow:

### Step 1: Fetch Emails
- Connects to Gmail API using OAuth 2.0
- Retrieves up to 20 unread emails from your inbox
- Filters for emails with potential actionable content

### Step 2: Extract Tasks
- Uses OpenAI's GPT model to analyze email content
- Identifies actionable tasks, deadlines, and priorities
- Extracts metadata like sender, subject, and email thread

### Step 3: Update Task List
- Stores extracted tasks in the agent's task storage
- Logs execution metrics (emails checked, tasks extracted)
- Returns summary of updated task list

## Workflow Configuration

The task refresh workflow is configured in `src/mastra/workflows/taskRefreshWorkflow.ts`:

- **Schedule**: Runs every hour (`0 * * * *` in cron format)
- **Max Emails**: Checks up to 20 unread emails per run
- **Execution Logs**: Stored in-memory (consider database for production)

## Troubleshooting

### Gmail API Authorization Issues

- **Error: invalid_grant**: Your refresh token may have expired. Delete the token from `.env` and re-authorize.
- **Error: insufficient permissions**: Ensure you granted `gmail.readonly` and `gmail.modify` scopes during OAuth setup.

### Task Extraction Not Working

- Verify your `OPENAI_API_KEY` is valid and has sufficient credits
- Check the OpenAI API usage dashboard for rate limit issues
- Review workflow logs for AI extraction errors

### Workflow Not Running on Schedule

- Ensure `workflowConfig.enabled` is set to `true` in `taskRefreshWorkflow.ts`
- Verify the schedule cron expression is correct
- Check Mastra Cloud Dashboard for workflow status (if deployed)

## Support and Documentation

- **Mastra Framework**: [https://docs.mastra.ai](https://docs.mastra.ai)
- **Gmail API Documentation**: [https://developers.google.com/gmail/api](https://developers.google.com/gmail/api)
- **OpenAI API**: [https://platform.openai.com/docs](https://platform.openai.com/docs)

## License

MIT License - feel free to use and modify for your own projects.
