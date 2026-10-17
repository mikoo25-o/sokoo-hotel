-- SokoHotel's standard plan: KSh 3,000 per month (300000 minor units).
-- Every new restaurant gets a free trial first (7 days by default, set by TRIAL_DAYS).
-- Change the price later with: update subscription_plans set price_minor = ... where code = 'monthly';
insert into public.subscription_plans (code, name, description, price_minor, billing_interval, max_staff, sort_order)
values ('monthly', 'SokoHotel Monthly', 'Everything included: waiter, kitchen, cashier and manager tools', 300000, 'month', null, 1)
on conflict (code) do nothing;
