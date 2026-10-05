SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;
DECLARE @lockResult int;
EXEC @lockResult = sys.sp_getapplock @Resource = 'washq-schema-v1',
  @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @lockResult < 0 THROW 50001, 'Could not initialize WashQ schema', 1;

IF OBJECT_ID('dbo.laundry_machines', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.laundry_machines (
    id int NOT NULL PRIMARY KEY,
    name nvarchar(80) NOT NULL,
    capacity_kg int NOT NULL CHECK (capacity_kg > 0)
  );
END;
IF OBJECT_ID('dbo.laundry_bookings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.laundry_bookings (
    id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    machine_id int NOT NULL REFERENCES dbo.laundry_machines(id),
    customer_name nvarchar(100) NOT NULL,
    slot datetime2(0) NOT NULL,
    status varchar(10) NOT NULL DEFAULT 'booked',
    created_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    cancelled_at datetime2(0) NULL,
    CONSTRAINT CK_laundry_status CHECK (
      (status = 'booked' AND cancelled_at IS NULL) OR
      (status = 'cancelled' AND cancelled_at IS NOT NULL)
    ),
    CONSTRAINT CK_laundry_hour CHECK (DATEPART(MINUTE, slot) = 0 AND DATEPART(SECOND, slot) = 0)
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.laundry_bookings') AND name = 'UX_laundry_active_slot')
  CREATE UNIQUE INDEX UX_laundry_active_slot
    ON dbo.laundry_bookings(machine_id, slot) WHERE status = 'booked';

INSERT INTO dbo.laundry_machines(id, name, capacity_kg)
SELECT seed.id, seed.name, seed.capacity_kg
FROM (VALUES (1, N'เครื่อง 01', 9), (2, N'เครื่อง 02', 12), (3, N'เครื่อง 03', 15))
  AS seed(id, name, capacity_kg)
WHERE NOT EXISTS (SELECT 1 FROM dbo.laundry_machines m WHERE m.id = seed.id);
COMMIT TRANSACTION;
