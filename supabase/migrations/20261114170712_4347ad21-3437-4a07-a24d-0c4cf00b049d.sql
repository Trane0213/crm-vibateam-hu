-- A mappa-függvénynek nincs szüksége emelt jogra: a meglévő szerepkör-függvényeket hívja, ugyanúgy, mint a többi dokumentumszabály.
ALTER FUNCTION public.ai_chat_folder_of(uuid) SECURITY INVOKER;