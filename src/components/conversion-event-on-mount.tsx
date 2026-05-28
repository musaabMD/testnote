"use client";

import { useEffect, useRef } from "react";
import {
  captureConversionEvent,
  type ConversionEventName,
  type ConversionEventProperties,
} from "@/lib/conversion-analytics";

type ConversionEventOnMountProps = {
  eventName: ConversionEventName;
  properties?: ConversionEventProperties;
};

export function ConversionEventOnMount({
  eventName,
  properties,
}: ConversionEventOnMountProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    captureConversionEvent(eventName, properties);
  }, [eventName, properties]);

  return null;
}

