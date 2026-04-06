-- Update the new user trigger to generate a random unique username
-- Format: user_XXXXXXXX (8 random alphanumeric chars)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  random_name text;
  name_exists boolean;
BEGIN
  -- Generate a unique random username
  LOOP
    random_name := 'user_' || substr(md5(random()::text), 1, 8);
    SELECT EXISTS(SELECT 1 FROM public.users WHERE display_name = random_name) INTO name_exists;
    EXIT WHEN NOT name_exists;
  END LOOP;

  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      random_name
    )
  );
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
