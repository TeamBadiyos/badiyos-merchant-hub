UPDATE public.merchants
   SET pin_hash = extensions.crypt('1234', extensions.gen_salt('bf')),
       updated_at = now()
 WHERE phone = '9999900000';