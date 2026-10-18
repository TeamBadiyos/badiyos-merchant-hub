CREATE OR REPLACE FUNCTION public.merchants_guard_location() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude)
     AND OLD.latitude IS NOT NULL AND OLD.longitude IS NOT NULL
     AND OLD.status = 'approved'
     AND auth.uid() IS NOT NULL
     AND current_setting('app.location_change_ok', true) IS DISTINCT FROM 'on'
     AND NOT public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']) THEN
    RAISE EXCEPTION 'Shop location changes need badiyos approval';
  END IF;
  RETURN NEW;
END $$;