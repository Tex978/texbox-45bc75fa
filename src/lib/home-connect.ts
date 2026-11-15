export function homeConnectFailure(status: number): { message: string; reconnect: boolean } {
  if (status === 401) return { message: "A Home Connect belépés lejárt vagy visszavonták. Kösd össze újra a fiókot. [HC/401]", reconnect: true };
  if (status === 403) return { message: "A Home Connect nem engedélyezte a hozzáférést. Újraösszekötéskor hagyd jóvá a gépek megfigyelését és vezérlését. [HC/403]", reconnect: true };
  if (status === 429) return { message: "A Home Connect túl sok lekérdezést kapott. Várj néhány percet; nem kell újra összekötni. [HC/429]", reconnect: false };
  if (status >= 500) return { message: `A Home Connect szolgáltatás átmenetileg nem elérhető. Próbáld később. [HC/${status}]`, reconnect: false };
  return { message: `A Home Connect adatlekérése sikertelen. [HC/${status}]`, reconnect: false };
}