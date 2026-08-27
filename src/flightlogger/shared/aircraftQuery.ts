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

        defaultEngineType
        defaultPMF

        fuelCoefficient
        fuelCoefficientMeasurement
        fuelCoefficientUnit

        taxiInTime
        taxiOutTime

        timerSeconds
        totalAirborneMinutes
        totalFuel
        totalLandings

        typeOfTimer
        typeOfTimerMeasurement

        primaryLog {
          id
          type
          measurementType
          totalSeconds
          durationWarningPercent
          offsetWarningSecondsStart
          offsetWarningSecondsEnd
          actionButtonsIsEnabled
          prefillIsEnabled
        }

        secondaryLog {
          id
          type
          measurementType
          totalSeconds
          durationWarningPercent
          offsetWarningSecondsStart
          offsetWarningSecondsEnd
          actionButtonsIsEnabled
          prefillIsEnabled
        }

        tertiaryLog {
          id
          type
          measurementType
          totalSeconds
          durationWarningPercent
          offsetWarningSecondsStart
          offsetWarningSecondsEnd
          actionButtonsIsEnabled
          prefillIsEnabled
        }
      }
    }
  }
`;

/**
 * Service information is intentionally fetched separately.
 */
export const AIRCRAFT_DETAIL_SERVICE_QUERY = /* GraphQL */ `
  query AircraftDetailService($callSigns: [String!]) {
    aircraft(first: 1, callSigns: $callSigns) {
      nodes {
        id
        callSign

        nextService {
          cyclesWarningColor
          dateWarningColor

          nextPrimaryService
          nextSecondaryService
          nextTertiaryService

          nextServiceCycles
          nextServiceDate

          primaryWarningColor
          secondaryWarningColor
          tertiaryWarningColor
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
          id
          color
          cyclesLeft
          daysLeft
          expiryCycles
          expiryDate
          expiryTime
          hasDocument
          logMeasurementType
          logType
          requirers
          serialNumber
          status
          subjectName
          timeLeft
          typeOfTimer
          typeOfTimerMeasurement
        }

        worstWarning {
          id
          color
          cyclesLeft
          daysLeft
          expiryCycles
          expiryDate
          expiryTime
          hasDocument
          logMeasurementType
          logType
          requirers
          serialNumber
          status
          subjectName
          timeLeft
          typeOfTimer
          typeOfTimerMeasurement
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
    $maintenanceAfter: String
    $maintenanceFirst: Int
  ) {
    aircraft(first: 1, callSigns: $callSigns) {
      nodes {
        id
        callSign

        maintenanceParts(
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

            approvedAt
            rejectedAt

            maintenanceType {
              name
              disabled
              expiresOnCycles
              expiresOnDate
              expiresOnLog
              requireSerialNumber
              requireUploadOfDocument
              triggerOnLogTime
              createdAt
              updatedAt
            }
          }

          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`;