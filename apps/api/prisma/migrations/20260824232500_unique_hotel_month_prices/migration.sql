-- One month-price per calendar month per pricing entity.
CREATE UNIQUE INDEX "hotel_month_prices_companyId_hotelId_month_key"
    ON "hotel_month_prices" ("companyId", "hotelId", "month");
CREATE UNIQUE INDEX "hotel_room_type_month_prices_companyId_hotelRoomTypeId_month_key"
    ON "hotel_room_type_month_prices" ("companyId", "hotelRoomTypeId", "month");
CREATE UNIQUE INDEX "hotel_meal_plan_month_prices_companyId_hotelMealPlanId_month_key"
    ON "hotel_meal_plan_month_prices" ("companyId", "hotelMealPlanId", "month");