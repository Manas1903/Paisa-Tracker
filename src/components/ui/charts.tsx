"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { fmt, fmtShort } from "@/lib/format";
import { CATEGORIES, OTHER_COLOR } from "@/lib/data";

export type ChartTheme = {
  dark: boolean;
  surface: string;
  text: string;
  ink: string;
  grid: string;
  muted: string;
  slot: string[]; // categorical slots, fixed order
  ramp: string[]; // sequential, low → high
  tooltipBg: string;
};

export const chartTheme = (dark: boolean): ChartTheme => ({
  dark,
  surface: dark ? "#161616" : "#ffffff",
  text: dark ? "#8a887f" : "#6b6a64",
  ink: dark ? "#f0efec" : "#0b0b0b",
  grid: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  muted: dark ? OTHER_COLOR.dark : OTHER_COLOR.light,
  slot: CATEGORIES.map((c) => (dark ? c.dark : c.light)),
  ramp: dark ? ["#202226", "#1d3d66", "#2a66b0", "#3987e5", "#a9cdf6"] : ["#f1f1ee", "#cfe0f6", "#8db8ec", "#2a78d6", "#164a8a"],
  tooltipBg: dark ? "rgba(28,28,28,0.96)" : "rgba(255,255,255,0.98)",
});

const ANIM = { animationDuration: 1100, animationEasing: "cubicOut", animationDurationUpdate: 800, animationEasingUpdate: "cubicInOut" } as const;

const tooltip = (T: ChartTheme) => ({
  backgroundColor: T.tooltipBg,
  borderColor: T.grid,
  textStyle: { color: T.ink, fontSize: 12 },
  extraCssText: "border-radius:14px;box-shadow:0 12px 32px -8px rgba(0,0,0,.25);",
});

const legend = (T: ChartTheme) => ({ top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: T.text } });

const valueAxis = (T: ChartTheme) => ({
  type: "value" as const,
  axisLabel: { color: T.text, fontSize: 11, formatter: (v: number) => fmtShort(v) },
  splitLine: { lineStyle: { color: T.grid } },
});

const catAxis = (T: ChartTheme, data: string[]) => ({
  type: "category" as const,
  data,
  axisLine: { lineStyle: { color: T.grid } },
  axisTick: { show: false },
  axisLabel: { color: T.text, fontSize: 11 },
});

const fade = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");
const vgrad = (hex: string, top: number) => ({
  type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [{ offset: 0, color: fade(hex, top) }, { offset: 1, color: fade(hex, 0) }],
});

export function Chart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  return <ReactECharts option={option} style={{ height, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

/** Running spend: this period vs the previous one. */
export function trendOption(T: ChartTheme, labels: string[], cur: (number | null)[], prev: (number | null)[], prevName: string): EChartsOption {
  const c = T.slot[0];
  return {
    ...ANIM,
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: legend(T),
    tooltip: { ...tooltip(T), trigger: "axis", valueFormatter: (v) => (v == null ? "-" : fmt(Number(v))) },
    xAxis: { ...catAxis(T, labels), boundaryGap: false },
    yAxis: valueAxis(T),
    series: [
      { name: prevName, type: "line", data: prev, smooth: true, symbol: "none", lineStyle: { width: 2, type: "dashed", color: T.muted }, itemStyle: { color: T.muted } },
      {
        name: "Now", type: "line", data: cur, smooth: true, symbol: "circle", symbolSize: 8, showSymbol: false,
        lineStyle: { width: 3, color: c, shadowBlur: T.dark ? 16 : 8, shadowColor: fade(c, 0.5) },
        itemStyle: { color: c, borderColor: T.surface, borderWidth: 2 },
        areaStyle: { color: vgrad(c, T.dark ? 0.45 : 0.28) },
      },
    ],
  };
}

export type Slice = { name: string; value: number; color: string };

export function donutOption(T: ChartTheme, slices: Slice[]): EChartsOption {
  return {
    ...ANIM,
    tooltip: { ...tooltip(T), trigger: "item", valueFormatter: (v) => fmt(Number(v)) },
    series: [{
      type: "pie", radius: ["60%", "86%"], padAngle: 2,
      itemStyle: { borderRadius: 8, borderColor: T.surface, borderWidth: 2 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 8 },
      data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      animationType: "scale",
    }],
  };
}

export function compareBarsOption(T: ChartTheme, cats: string[], cur: number[], prev: number[], prevName: string): EChartsOption {
  const bar = (name: string, data: number[], color: string) => ({
    name, type: "bar" as const, data, barMaxWidth: 12, barGap: "30%", itemStyle: { color, borderRadius: [0, 4, 4, 0] },
  });
  return {
    ...ANIM,
    grid: { left: 8, right: 16, top: 30, bottom: 4, containLabel: true },
    legend: legend(T),
    tooltip: { ...tooltip(T), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt(Number(v)) },
    xAxis: valueAxis(T),
    yAxis: { ...catAxis(T, cats), inverse: true, axisLine: { show: false } },
    series: [bar(prevName, prev, T.muted), bar("Now", cur, T.slot[0])],
  };
}

export function heatmapOption(T: ChartTheme, days: [string, number][], from: string, to: string): EChartsOption {
  const sorted = days.map((d) => d[1]).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
  return {
    ...ANIM,
    tooltip: { ...tooltip(T), formatter: (p) => { const v = (p as unknown as { value: [string, number] }).value; return `${v[0]}<br/><b>${fmt(v[1])}</b>`; } },
    visualMap: { min: 0, max: p95, show: false, inRange: { color: T.ramp } },
    calendar: {
      range: [from, to], top: 24, left: 36, right: 8, bottom: 4, cellSize: ["auto", 15],
      splitLine: { show: false },
      itemStyle: { color: T.ramp[0], borderColor: T.surface, borderWidth: 3 },
      dayLabel: { firstDay: 1, color: T.text, fontSize: 10, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
      monthLabel: { color: T.text, fontSize: 11 },
      yearLabel: { show: false },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: days }],
  };
}

export type Flow = { source: string; target: string; value: number };

export function sankeyOption(T: ChartTheme, nodes: Slice[], links: Flow[]): EChartsOption {
  return {
    ...ANIM,
    tooltip: { ...tooltip(T), trigger: "item", valueFormatter: (v) => fmt(Number(v)) },
    series: [{
      type: "sankey", left: 8, right: 150, top: 8, bottom: 8, nodeWidth: 14, nodeGap: 10, draggable: false,
      emphasis: { focus: "adjacency" },
      label: { color: T.ink, fontSize: 12, formatter: (p) => `${p.name}  ${fmtShort(Number(p.value))}` },
      lineStyle: { color: "gradient", curveness: 0.5, opacity: T.dark ? 0.35 : 0.28 },
      itemStyle: { borderWidth: 0, borderRadius: 4 },
      data: nodes.map((n) => ({ name: n.name, itemStyle: { color: n.color } })),
      links,
    }],
  };
}

/** Monthly bars: one series per entity, colours fixed by caller. */
export function barsOption(T: ChartTheme, labels: string[], series: { name: string; data: number[]; color: string }[], stacked = true): EChartsOption {
  return {
    ...ANIM,
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: legend(T),
    tooltip: { ...tooltip(T), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt(Number(v)) },
    xAxis: catAxis(T, labels),
    yAxis: valueAxis(T),
    series: series.map((s, i) => ({
      name: s.name, type: "bar", data: s.data, stack: stacked ? "s" : undefined, barMaxWidth: 18, barGap: "20%",
      itemStyle: {
        color: s.color, borderColor: T.surface, borderWidth: stacked ? 1 : 0,
        borderRadius: !stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0,
      },
    })),
  };
}

/** Single-series area line, e.g. net worth. Milestones drawn as dashed marker lines. */
export function areaOption(T: ChartTheme, labels: string[], data: number[], name: string, marks: number[] = [], money = true): EChartsOption {
  const c = T.slot[2];
  return {
    ...ANIM,
    grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
    tooltip: { ...tooltip(T), trigger: "axis", valueFormatter: (v) => (money ? fmt(Number(v)) : String(v)) },
    xAxis: { ...catAxis(T, labels), boundaryGap: false },
    yAxis: { ...valueAxis(T), scale: true, ...(money ? {} : { axisLabel: { color: T.text, fontSize: 11 } }) },
    series: [{
      name, type: "line", data, smooth: true, symbol: "circle", symbolSize: 7, showSymbol: false,
      lineStyle: { width: 3, color: c }, itemStyle: { color: c, borderColor: T.surface, borderWidth: 2 },
      areaStyle: { color: vgrad(c, T.dark ? 0.4 : 0.25) },
      markLine: marks.length ? {
        symbol: "none", silent: true,
        lineStyle: { color: T.muted, type: "dashed" },
        label: { color: T.text, formatter: (p) => fmtShort(Number(p.value)), position: "insideEndTop" },
        data: marks.map((m) => ({ yAxis: m })),
      } : undefined,
    }],
  };
}

/** Portfolio: money put in (dashed) vs current value (area). One axis, both ₹. */
export function portfolioOption(T: ChartTheme, labels: string[], invested: number[], value: number[]): EChartsOption {
  const c = T.slot[2];
  return {
    ...ANIM,
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: legend(T),
    tooltip: { ...tooltip(T), trigger: "axis", valueFormatter: (v) => fmt(Number(v)) },
    xAxis: { ...catAxis(T, labels), boundaryGap: false },
    yAxis: { ...valueAxis(T), scale: true },
    series: [
      { name: "Invested", type: "line", data: invested, step: "end", symbol: "none", lineStyle: { width: 2, type: "dashed", color: T.muted }, itemStyle: { color: T.muted } },
      {
        name: "Value", type: "line", data: value, smooth: true, symbol: "circle", symbolSize: 7, showSymbol: false,
        lineStyle: { width: 3, color: c }, itemStyle: { color: c, borderColor: T.surface, borderWidth: 2 },
        areaStyle: { color: vgrad(c, T.dark ? 0.4 : 0.25) },
      },
    ],
  };
}
