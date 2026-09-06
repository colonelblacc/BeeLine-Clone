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
  const renderContent = () => {
    switch (type) {
      case 0: // Straight
        return (
          <Path
            d="M12 20L12 4M12 4L5 11M12 4L19 11"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 1: // Left
        return (
          <Path
            d="M18 20V12C18 9.79086 16.2091 8 14 8H4M4 8L10 2M4 8L10 14"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 2: // Right
        return (
          <Path
            d="M6 20V12C6 9.79086 7.79086 8 10 8H20M20 8L14 2M20 8L14 14"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 3: // U-Turn
        return (
          <Path
            d="M18 20V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V19M6 19L2 15M6 19L10 15"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 4: // Slight Left
        return (
          <Path
            d="M16 20L10 10M10 10L6 18M10 10L18 8"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 5: // Slight Right
        return (
          <Path
            d="M8 20L14 10M14 10L6 8M14 10L18 18"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 6: // Arrived
        return (
          <Path
            d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            stroke={color}
            strokeWidth={2.5}
            fill={color}
            fillOpacity={0.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      default:
        return (
          <Path
            d="M12 20L12 4M12 4L5 11M12 4L19 11"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {renderContent()}
    </Svg>
  );
}
