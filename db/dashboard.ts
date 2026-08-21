import { env } from "cloudflare:workers";
import { getPortfolioDeliveryInsights, type DeliveryInsightAccess } from "./stage2-insights";
import { getPortfolioStage4Insights, type Stage4InsightAccess } from "./stage4-insights";

export async function getDashboard(
  access: DeliveryInsightAccess = { backlog: true, sprints: true, metrics: true },
  stage4Access: Stage4InsightAccess = { releases: false, uat: false, defects: false, signoffs: false },
) {
  const one = async (sql: string) => env.DB.prepare(sql).first<Record<string, number>>();
  const [portfolio, health, milestones, raid, ideas, progress, attention, delivery, stage4] = await Promise.all([
    one(`SELECT (SELECT COUNT(*) FROM products WHERE record_status='ACTIVE') products,(SELECT COUNT(*) FROM projects WHERE record_status='ACTIVE') projects`),
    one(`SELECT SUM(CASE WHEN health='On Track' THEN 1 ELSE 0 END) onTrack,SUM(CASE WHEN health='At Risk' THEN 1 ELSE 0 END) atRisk,SUM(CASE WHEN health IN ('Delayed','Blocked') THEN 1 ELSE 0 END) critical FROM projects WHERE record_status='ACTIVE'`),
    one(`SELECT COUNT(*) total,SUM(CASE WHEN status NOT IN ('Completed','Cancelled') AND date(planned_date)<date('now') THEN 1 ELSE 0 END) overdue,SUM(CASE WHEN status NOT IN ('Completed','Cancelled') AND date(planned_date) BETWEEN date('now') AND date('now','+30 day') THEN 1 ELSE 0 END) upcoming FROM milestones WHERE record_status='ACTIVE'`),
    one(`SELECT COUNT(*) total,SUM(CASE WHEN escalated=1 OR impact='Critical' OR(status NOT IN ('Resolved','Closed') AND due_date IS NOT NULL AND date(due_date)<date('now'))THEN 1 ELSE 0 END) attention FROM raid_items WHERE record_status='ACTIVE'`),
    one(`SELECT COUNT(*) total,SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN status='Under Review' THEN 1 ELSE 0 END) review FROM ideas WHERE record_status='ACTIVE'`),
    one(`SELECT COALESCE(ROUND(AVG(overall_progress)),0) avgProgress,COALESCE(ROUND(AVG(development_progress)),0) avgDevelopment FROM projects WHERE record_status='ACTIVE'`),
    env.DB.prepare(`SELECT 'Project' kind,business_id businessId,name title,health signal,target_end_date dueDate,'Projects' destination FROM projects WHERE record_status='ACTIVE' AND health IN('At Risk','Delayed','Blocked') UNION ALL SELECT 'Milestone',business_id,name,'Overdue',planned_date,'Milestones' FROM milestones WHERE record_status='ACTIVE' AND status NOT IN('Completed','Cancelled') AND date(planned_date)<date('now') UNION ALL SELECT type,business_id,title,CASE WHEN escalated=1 THEN 'Escalated' ELSE impact END,due_date,'RAID' FROM raid_items WHERE record_status='ACTIVE' AND(escalated=1 OR impact='Critical') LIMIT 12`).all(),
    getPortfolioDeliveryInsights(access),
    getPortfolioStage4Insights(stage4Access),
  ]);
  return {
    portfolio,
    health,
    milestones,
    raid,
    ideas,
    progress,
    delivery,
    stage4,
    attention: [...delivery.attention, ...attention.results, ...stage4.attention].slice(0, 12),
    calculatedAt: new Date().toISOString(),
  };
}
