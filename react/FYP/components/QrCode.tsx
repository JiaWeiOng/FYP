
import React, { useMemo } from "react";
import { View } from "react-native";
import QRCode from "qrcode";

type Props = { value: string; size?: number; color?: string; background?: string };

export function QrCode({ value, size = 200, color = "#000000", background = "#FFFFFF" }: Props) {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(value || " ", { errorCorrectionLevel: "M" });
      return { n: qr.modules.size, data: qr.modules.data };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return null;
  const { n, data } = matrix;
  const cell = Math.max(1, Math.floor(size / n));
  const dim = cell * n;

  return (
    <View style={{ width: dim, height: dim, backgroundColor: background }}>
      {Array.from({ length: n }).map((_, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {Array.from({ length: n }).map((_, col) => (
            <View
              key={col}
              style={{ width: cell, height: cell, backgroundColor: data[r * n + col] ? color : background }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
