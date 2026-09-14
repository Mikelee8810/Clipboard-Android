/**
 * 引导页插画 —— 平台中性(不引用任何平台专有令牌)。
 *
 * 颜色全部由调用方以十六进制传入:iOS 传单色墨(iosAccent),Android 传 M3 primary。
 * 这样同一套 SVG 在两端各自着色,符合「shared component + 平台着色」的约定。
 */
import React from 'react';
import Svg, { G, Path, Rect, Circle, Line } from 'react-native-svg';

/** Clipboard 品牌标：叠放的剪贴板/历史记录卡片。 */
export function BrandMark({ color, size = 64 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Rect x={92} y={136} width={250} height={292} rx={48} fill="none" stroke={color} strokeWidth={24} opacity={0.28} />
      <Rect x={120} y={108} width={250} height={292} rx={48} fill="none" stroke={color} strokeWidth={24} opacity={0.55} />
      <Rect x={148} y={80} width={250} height={292} rx={48} fill="none" stroke={color} strokeWidth={24} />
      <Rect x={210} y={58} width={126} height={70} rx={28} fill={color} />
      <Rect x={194} y={174} width={158} height={22} rx={11} fill={color} opacity={0.92} />
      <Rect x={194} y={226} width={124} height={22} rx={11} fill={color} opacity={0.72} />
      <Rect x={194} y={278} width={142} height={22} rx={11} fill={color} opacity={0.5} />
    </Svg>
  );
}

interface ArtColors {
  accent: string;
  line: string;
  surface: string;
  bg: string;
  fg2: string;
}

/** 伴侣模式:大桌面窗口(带剪贴板列表)+ 贴在前面的小手机,表达「依附」而非平级 */
export function CompanionArt({
  accent,
  line,
  surface,
  bg,
  fg2,
  width = 224,
}: ArtColors & { width?: number }) {
  const h = Math.round((width * 128) / 232);
  return (
    <Svg width={width} height={h} viewBox="0 0 232 128">
      {/* desktop app window */}
      <Rect
        x={30}
        y={14}
        width={120}
        height={78}
        rx={8}
        fill={surface}
        stroke={line}
        strokeWidth={1.6}
      />
      <Line x1={30} y1={32} x2={150} y2={32} stroke={line} strokeWidth={1.4} />
      <Circle cx={40} cy={23} r={2} fill={fg2} opacity={0.6} />
      <Circle cx={48} cy={23} r={2} fill={fg2} opacity={0.6} />
      <Circle cx={56} cy={23} r={2} fill={fg2} opacity={0.6} />
      {/* clipboard rows */}
      <Line
        x1={42}
        y1={46}
        x2={92}
        y2={46}
        stroke={accent}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <Line
        x1={42}
        y1={56}
        x2={122}
        y2={56}
        stroke={fg2}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={0.4}
      />
      <Line
        x1={42}
        y1={66}
        x2={106}
        y2={66}
        stroke={fg2}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={0.4}
      />
      <Line
        x1={42}
        y1={76}
        x2={118}
        y2={76}
        stroke={fg2}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* phone companion, in front / bottom-right */}
      <Rect
        x={128}
        y={44}
        width={48}
        height={72}
        rx={10}
        fill={bg}
        stroke={accent}
        strokeWidth={1.8}
      />
      <Line
        x1={138}
        y1={58}
        x2={166}
        y2={58}
        stroke={accent}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1={138}
        y1={70}
        x2={160}
        y2={70}
        stroke={fg2}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.4}
      />
      <Line
        x1={146}
        y1={108}
        x2={158}
        y2={108}
        stroke={fg2}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.5}
      />
    </Svg>
  );
}

/** v1 局域网同步升级到 v2 端到端安全连接。 */
export function SyncUpgradeArt({
  accent,
  line,
  surface,
  bg,
  fg2,
  width = 286,
}: ArtColors & { width?: number }) {
  const h = Math.round((width * 142) / 286);
  return (
    <Svg width={width} height={h} viewBox="0 0 286 142">
      <G opacity={0.52}>
        <Circle cx={61} cy={72} r={48} fill={surface} />
        <Path
          d="M43 55 a25 25 0 0 1 36 0 M49 62 a17 17 0 0 1 24 0 M57 69 a6 6 0 0 1 8 0"
          stroke={fg2}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        <Rect
          x={29}
          y={79}
          width={20}
          height={32}
          rx={5}
          fill={bg}
          stroke={fg2}
          strokeWidth={1.8}
        />
        <Rect
          x={72}
          y={78}
          width={31}
          height={22}
          rx={4}
          fill={bg}
          stroke={fg2}
          strokeWidth={1.8}
        />
        <Line x1={87.5} y1={100} x2={87.5} y2={108} stroke={fg2} strokeWidth={1.8} />
        <Line
          x1={81}
          y1={109}
          x2={94}
          y2={109}
          stroke={fg2}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </G>

      <Path d="M119 72 H153" stroke={line} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M145 64 L153 72 L145 80"
        stroke={accent}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <Circle cx={224} cy={72} r={54} fill={surface} />
      <Path
        d="M187 93 C198 55 246 48 261 82"
        stroke={accent}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={187} cy={93} r={4} fill={accent} />
      <Circle cx={261} cy={82} r={4} fill={accent} />
      <Rect
        x={174}
        y={78}
        width={24}
        height={38}
        rx={6}
        fill={bg}
        stroke={accent}
        strokeWidth={2}
      />
      <Rect
        x={248}
        y={68}
        width={34}
        height={24}
        rx={4}
        fill={bg}
        stroke={accent}
        strokeWidth={2}
      />
      <Line x1={265} y1={92} x2={265} y2={101} stroke={accent} strokeWidth={2} />
      <Line
        x1={258}
        y1={102}
        x2={272}
        y2={102}
        stroke={accent}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Circle cx={224} cy={70} r={19} fill={accent} />
      <Path d="M224 57 L235 61 V69 C235 77 230 82 224 85 C218 82 213 77 213 69 V61 Z" fill={bg} />
      <Path
        d="M219 70 L223 74 L230 66"
        stroke={accent}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** 局域网直连:手机 + 电脑两个节点,虚线链路,顶部 Wi-Fi 弧 */
export function LanArt({
  accent,
  line,
  bg,
  fg2,
  width = 220,
}: Omit<ArtColors, 'surface'> & { width?: number }) {
  const h = Math.round((width * 96) / 220);
  return (
    <Svg width={width} height={h} viewBox="0 0 220 96">
      {/* wifi arcs from midpoint */}
      <Path
        d="M99 40 a15 15 0 0 1 22 0"
        stroke={accent}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <Path
        d="M93 34 a24 24 0 0 1 34 0"
        stroke={accent}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      <Path
        d="M87 28 a33 33 0 0 1 46 0"
        stroke={accent}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.3}
      />
      {/* link line */}
      <Line
        x1={54}
        y1={70}
        x2={166}
        y2={70}
        stroke={fg2}
        strokeWidth={1.4}
        strokeDasharray="2 5"
        strokeLinecap="round"
        opacity={0.7}
      />
      <Circle cx={78} cy={70} r={3} fill={accent} />
      <Circle cx={142} cy={70} r={3} fill={accent} />
      {/* phone node */}
      <Rect x={40} y={56} width={20} height={30} rx={4} fill={bg} stroke={fg2} strokeWidth={1.6} />
      <Line x1={47} y1={81} x2={53} y2={81} stroke={fg2} strokeWidth={1.6} strokeLinecap="round" />
      {/* desktop node */}
      <Rect x={156} y={54} width={30} height={21} rx={3} fill={bg} stroke={fg2} strokeWidth={1.6} />
      <Line x1={171} y1={75} x2={171} y2={82} stroke={fg2} strokeWidth={1.6} />
      <Line
        x1={165}
        y1={83}
        x2={177}
        y2={83}
        stroke={fg2}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}
