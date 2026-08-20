import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { TurnType } from '../constants/ble';
import { COLORS } from '../constants/config';

interface TurnArrowProps {
  type: TurnType;
  size?: number;
  color?: string;
}

export function TurnArrow({ type, size = 120, color = COLORS.text }: TurnArrowProps) {
  // Beeline-style bold turn arrows
  const getPath = () => {
    switch (type) {
      case 0: // Straight
        return "M12 20L12 4M12 4L5 11M12 4L19 11";
      case 1: // Left
        return "M20 12L4 12M4 12L11 5M4 12L11 19";
      case 2: // Right
        return "M4 12L20 12M20 12L13 5M20 12L13 19";
      case 3: // U-Turn
        return "M4 10V14C4 17.3137 6.68629 20 10 20H14C17.3137 20 20 17.3137 20 14V10M16 14L20 10M20 10L24 14";
      default:
        return "M12 20L12 4M12 4L5 11M12 4L19 11"; // Default to straight
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={getPath()}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
