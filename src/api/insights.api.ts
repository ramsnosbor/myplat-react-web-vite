import { apiClient } from './client'

export interface InsightDefinition {
  id?: string
  name: string
  description?: string
}

export interface InsightColumn {
  key: string
  label?: string
  type?: string
}

export type InsightDataRow = Record<string, string | number | boolean | null>

export type InsightSummary = Record<string, string | number | boolean | null>

export interface InsightVisualization {
  type?: string
  title?: string
}

export interface InsightResult {
  visualization?: string | InsightVisualization
  columns: Array<string | InsightColumn>
  data: InsightDataRow[]
  summary?: InsightSummary
}

export interface InsightsChatResponse {
  message: string
  matchedInsight?: InsightDefinition
  result?: InsightResult
  suggestions: string[]
  conversationId?: string
}

export const insightsApi = {
  async getInsights(): Promise<InsightDefinition[]> {
    const response = await apiClient.get<InsightDefinition[]>('/insights')
    return response.data
  },

  async chat(message: string, conversationId?: string): Promise<InsightsChatResponse> {
    const response = await apiClient.post<InsightsChatResponse>('/insights/chat', { message, conversationId })
    return response.data
  },
}
