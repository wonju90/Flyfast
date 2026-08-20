import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useAirportNames() {
  const [names, setNames] = useState({});

  useEffect(() => {
    api
      .searchAirports()
      .then((data) => {
        const map = {};
        (data.airports || []).forEach((a) => {
          map[a.code] = a.name;
        });
        setNames(map);
      })
      .catch(() => {});
  }, []);

  return names;
}
