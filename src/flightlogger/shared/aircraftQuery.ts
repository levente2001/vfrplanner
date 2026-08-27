export const AIRCRAFT_QUERY = /* GraphQL */ `
  query Aircraft($after: String, $first: Int, $callSigns: [String!]) {
    aircraft(after: $after, first: $first, callSigns: $callSigns) {
      nodes {
        id
        callSign
        model
        aircraftClass
        aircraftType
        disabled
        currentAirport {
          id
          name
        }
        homeAirport {
          id
          name
        }
        worstMaintenanceWarning {
          color
          status
          subjectName
        }
        worstWarning {
          color
          status
          subjectName
        }
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
    }
  }
`;

export const BASIC_AIRCRAFT_QUERY = /* GraphQL */ `
  query BasicAircraft($after: String, $first: Int, $callSigns: [String!]) {
    aircraft(after: $after, first: $first, callSigns: $callSigns) {
      nodes {
        id
        callSign
        model
        aircraftClass
        aircraftType
        disabled

        currentAirport {
          id
          name
        }

        homeAirport {
          id
          name
        }
      }

      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
    }
  }
`;

/**
 * Detailed core data for ONE aircraft only.
 *
 * Keeping this separate from maintenance/service/warnings prevents
 * FlightLogger's GraphQL complexity score from exploding.
 */
export const AIRCRAFT_DETAIL_CORE_QUERY = /* GraphQL */ `
  query AircraftDetailCore($callSigns: [String!]) {
    aircraft(first: 1, callSigns: $callSigns) {
      nodes {
        id
        callSign
        model
        aircraftClass
        aircraftType
        disabled

        currentAirport {
          id
          name
        }

        homeAirport {
          id
          name
        }
      }
    }
  }
`;

/**
 * Warnings are another separate request so their nested fields
 * do not increase the core aircraft query complexity.
 */
export const AIRCRAFT_DETAIL_WARNINGS_QUERY = /* GraphQL */ `
  query AircraftDetailWarnings($callSigns: [String!]) {
    aircraft(first: 1, callSigns: $callSigns) {
      nodes {
        id
        callSign

        worstMaintenanceWarning {
          color
          cyclesLeft
          daysLeft
          expiryDate
          serialNumber
          status
          subjectName
          timeLeft
        }
      }
    }
  }
`;

/**
 * Maintenance is paginated separately.
 *
 * Only 5 maintenance records are requested per GraphQL call.
 * This is deliberate to stay well below FlightLogger's
 * complexity limit.
 */
export const AIRCRAFT_MAINTENANCE_QUERY = /* GraphQL */ `
  query AircraftMaintenance(
    $callSigns: [String!]
    $maintenanceStatuses: [MaintenancePartStatusEnum!]
    $maintenanceAfter: String
    $maintenanceFirst: Int
  ) {
    aircraft(first: 1, callSigns: $callSigns) {
      nodes {
        maintenanceParts(
          status: $maintenanceStatuses
          after: $maintenanceAfter
          first: $maintenanceFirst
        ) {
          nodes {
            id
            name
            serialNumber
            status

            expirationCycles
            expirationDate
            expirationLogSeconds
            expiresOnLog

            audit {
              createdAt
              createdById
              updatedAt
              updatedById
            }

            approvedAt

            approvedBy {
              id
              callSign
              firstName
              lastName
            }

            rejectedAt

            rejectedBy {
              id
              callSign
              firstName
              lastName
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

/*
 * FlightLogger schema introspection was run for discrep/squawk/defect/issue/
 * severity/resolution and returned no public aircraft fields or query fields.
 * Do not add discrepancy UI unless FlightLogger exposes a documented GraphQL
 * field for it; scraping trener.flightlogger.net is intentionally avoided.
 */
