import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, Clock, Calendar, MoveRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { formatUtc } from "./formatUtc";

import { Link } from "wouter";

interface TemporalData {
  posting_hour_distribution: number[]; // 24 values
  weekday_distribution: number[]; // 7 values
  first_seen?: string;
  last_seen?: string;
  activity_bursts?: Array<{ at: string; evidence_ids?: string[] }>;
  inactive_periods?: Array<{ start: string; end: string; days: number }>;
  migration_candidates?: Array<{ from_platform: string; to_platform: string; window_start: string; window_end: string; evidence_ids?: string[]; warning?: string | null }>;
  observation_count: number;
  evidence_ids?: string[];
  warning?: string;
}

export function TemporalResult({ data, module }: { data: TemporalData, module: string }) {
  const hours = data.posting_hour_distribution?.map((count, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    count
  })) || [];

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdays = data.weekday_distribution?.map((count, i) => ({
    day: days[i],
    count
  })) || [];

  return (
    <div className="space-y-6">
      {data.warning && (
        <div className="bg-warning/10 text-warning p-4 rounded-md text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>{data.warning}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Observations</p>
              <p className="text-2xl font-mono">{data.observation_count ?? 0}</p>
            </div>
            {data.first_seen && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3"/> First Seen</p>
                <p className="text-sm font-mono">{formatUtc(data.first_seen)}</p>
              </div>
            )}
            {data.last_seen && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3"/> Last Seen</p>
                <p className="text-sm font-mono">{formatUtc(data.last_seen)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {data.posting_hour_distribution?.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Hourly Distribution (UTC)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hours} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="hour" fontSize={10} tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{fill: 'hsl(var(--muted))'}} 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.weekday_distribution?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weekday Pattern</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdays} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{fill: 'hsl(var(--muted))'}} 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
        
        {((data.activity_bursts && data.activity_bursts.length > 0) || (data.inactive_periods && data.inactive_periods.length > 0)) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Notable Periods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.activity_bursts && data.activity_bursts.length > 0 && (
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">High Activity Bursts</h4>
                  <ul className="space-y-1">
                    {data.activity_bursts.map((burst, i) => {
                      let formatted = burst.at || "Unknown time";
                      if (burst.at) {
                        formatted = formatUtc(burst.at);
                      }
                      return (
                        <li key={i} className="text-sm font-mono bg-muted/50 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <span>{formatted}</span>
                            {burst.evidence_ids && burst.evidence_ids.length > 0 && (
                              <div className="flex gap-1 flex-wrap justify-end max-w-[50%]">
                                {burst.evidence_ids.map(eid => (
                                  <Link key={eid} href={`/evidence?evidence=${encodeURIComponent(eid)}`} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20">
                                    Ref: {eid.substring(0,8)}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {data.inactive_periods && data.inactive_periods.length > 0 && (
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Suspicious Inactivity</h4>
                  <ul className="space-y-1">
                    {data.inactive_periods.map((period, i) => {
                      let start = period.start || "?";
                      let end = period.end || "?";
                      start = formatUtc(period.start, true);
                      end = formatUtc(period.end, true);
                      return (
                        <li key={i} className="text-sm font-mono bg-muted/50 p-2 rounded">
                          {start} to {end} ({period.days} days)
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {data.migration_candidates && data.migration_candidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Migration Candidates</CardTitle>
            <CardDescription>Possible account/platform migrations based on temporal handoffs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.migration_candidates.map((mc, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 border border-border rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 font-mono text-sm">
                      <span className="text-muted-foreground">{mc.from_platform}</span>
                      <MoveRight className="w-4 h-4 text-primary" />
                      <span>{mc.to_platform}</span>
                    </div>
                    {mc.evidence_ids && mc.evidence_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-end max-w-[40%]">
                        {mc.evidence_ids.map(eid => (
                          <Link key={eid} href={`/evidence?evidence=${encodeURIComponent(eid)}`} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20">
                            Ref: {eid.substring(0,8)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {mc.window_start && mc.window_end ? `${mc.window_start.substring(0, 10)} to ${mc.window_end.substring(0, 10)}` : "Unknown window"}
                  </div>
                  {mc.warning && (
                    <div className="text-xs text-warning bg-warning/10 p-1.5 rounded">{mc.warning}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
